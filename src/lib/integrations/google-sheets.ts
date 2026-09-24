import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { env, isGoogleConfigured } from "@/lib/env";
import { hasFeature } from "@/lib/plan";

/**
 * Google Sheets — every completed lead form becomes a row. See
 * docs/INTEGRATIONS.md.
 *
 * Scope is `drive.file`: the app can create a spreadsheet and edit the files
 * it created, and nothing else in the customer's Drive. It is also a
 * non-sensitive scope, so the consent screen needs no security assessment.
 *
 * One spreadsheet per workspace ("InstaDM247 leads"), one tab per lead form,
 * with a header row made from the form's questions. Values are written RAW, so
 * an answer like `=HYPERLINK(...)` is stored as text and never evaluated.
 */

export const PROVIDER = "google_sheets";
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export const redirectUri = () => `${env.appUrl}/api/integrations/google/callback`;
export const sheetUrl = (spreadsheetId: string) => `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

async function google<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.body && typeof rest.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = json as { error?: { message?: string } | string; error_description?: string };
    const message =
      (typeof err.error === "object" ? err.error?.message : err.error_description ?? err.error) ??
      `Google returned ${res.status}`;
    throw new GoogleError(String(message), res.status);
  }
  return json as T;
}

// --- OAuth ------------------------------------------------------------------

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    // A refresh token, so rows can be written long after the customer leaves.
    access_type: "offline",
    // Always show consent: Google only returns a refresh token on consent.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return google<TokenResponse>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
}

async function accessTokenFor(refreshToken: string): Promise<string> {
  const token = await google<TokenResponse>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  return token.access_token;
}

/**
 * The Google account's email, from the ID token that came back with the
 * access token. It arrived directly from Google's token endpoint over TLS, so
 * reading it without checking the signature is what Google's docs allow.
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function revoke(refreshToken: string): Promise<void> {
  await google(`${REVOKE_URL}?${new URLSearchParams({ token: refreshToken })}`, { method: "POST" }).catch(
    () => undefined, // already revoked in their Google account — nothing to undo
  );
}

// --- Spreadsheet ------------------------------------------------------------

export const SPREADSHEET_TITLE = "InstaDM247 leads";

type Spreadsheet = { spreadsheetId: string; sheets?: Array<{ properties: { title: string } }> };

async function createSpreadsheet(token: string): Promise<string> {
  const created = await google<Spreadsheet>(SHEETS, {
    method: "POST",
    token,
    body: JSON.stringify({ properties: { title: SPREADSHEET_TITLE } }),
  });
  return created.spreadsheetId;
}

async function tabTitles(token: string, spreadsheetId: string): Promise<string[]> {
  const sheet = await google<Spreadsheet>(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    { token },
  );
  return (sheet.sheets ?? []).map((s) => s.properties.title);
}

/** Tab titles can't contain []*?/\: and are capped at 100 characters. */
export function tabTitle(formName: string): string {
  return formName.replace(/[[\]*?/\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Leads";
}

/** A1 range for a tab, quoted — titles with spaces or apostrophes need it. */
const rangeFor = (title: string) => `'${title.replace(/'/g, "''")}'!A1`;

/**
 * Connect: save the refresh token and make sure the workspace has a
 * spreadsheet this Google account can write to. Reconnecting the same Google
 * account keeps the existing spreadsheet; a different account gets a new one,
 * since `drive.file` can't reach a file another account's grant created.
 */
export async function connect(
  workspaceId: string,
  tokens: TokenResponse,
): Promise<{ spreadsheetId: string; email: string | null }> {
  if (!tokens.refresh_token) {
    throw new GoogleError("Google didn't return offline access. Please try connecting again.", 400);
  }
  const email = emailFromIdToken(tokens.id_token);
  const existing = await prisma.integration.findFirst({ where: { workspaceId, provider: PROVIDER } });

  let spreadsheetId = existing?.targetId ?? null;
  if (spreadsheetId) {
    try {
      await tabTitles(tokens.access_token, spreadsheetId);
    } catch {
      spreadsheetId = null;
    }
  }
  spreadsheetId ??= await createSpreadsheet(tokens.access_token);

  const data = {
    name: "Google Sheets",
    apiKeyEnc: encrypt(tokens.refresh_token),
    targetId: spreadsheetId,
    targetName: email ? `${SPREADSHEET_TITLE} · ${email}` : SPREADSHEET_TITLE,
    enabled: true,
    lastError: null,
  };
  if (existing) {
    // The old grant is replaced; revoke it so it doesn't linger in their account.
    const old = decrypt(existing.apiKeyEnc);
    await prisma.integration.update({ where: { id: existing.id }, data });
    if (old && old !== tokens.refresh_token) await revoke(old);
  } else {
    await prisma.integration.create({ data: { workspaceId, provider: PROVIDER, ...data } });
  }
  return { spreadsheetId, email };
}

export type LeadRow = {
  formName: string;
  /** The form's questions, in order — becomes the header row of a new tab. */
  questions: Array<{ key: string; label: string }>;
  answers: Record<string, unknown>;
  username: string | null;
  name: string | null;
  at: Date;
};

const FIXED_HEADER = ["Submitted (UTC)", "Instagram", "Name"];

/**
 * Append one lead. Best-effort like every lead destination: a failure is
 * recorded on the integration for the customer to see, never thrown into the
 * flow that captured the lead.
 */
export async function appendLead(
  workspace: { id: string; planKey?: string | null },
  row: LeadRow,
): Promise<"sent" | "skipped" | "failed"> {
  if (!isGoogleConfigured()) return "skipped";
  // A plan that no longer includes integrations stops the sync; reconnecting
  // isn't needed when they upgrade again.
  if (!hasFeature(workspace, "integrations")) return "skipped";

  const integration = await prisma.integration.findFirst({
    where: { workspaceId: workspace.id, provider: PROVIDER, enabled: true },
  });
  if (!integration?.targetId) return "skipped";

  try {
    const refreshToken = decrypt(integration.apiKeyEnc);
    if (!refreshToken) throw new GoogleError("The Google connection can't be read. Reconnect Google Sheets.", 401);
    const token = await accessTokenFor(refreshToken);
    const spreadsheetId = integration.targetId;
    const title = tabTitle(row.formName);

    if (!(await tabTitles(token, spreadsheetId)).includes(title)) {
      await google(`${SHEETS}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: "POST",
        token,
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
      });
      await append(token, spreadsheetId, title, [...FIXED_HEADER, ...row.questions.map((q) => q.label)]);
    }

    const cell = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));
    await append(token, spreadsheetId, title, [
      row.at.toISOString().replace("T", " ").slice(0, 19),
      row.username ? `@${row.username}` : "",
      row.name ?? "",
      ...row.questions.map((q) => cell(row.answers[q.key])),
    ]);

    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });
    return "sent";
  } catch (error) {
    const message =
      error instanceof GoogleError && (error.status === 400 || error.status === 401)
        ? "Google access was removed or expired. Reconnect Google Sheets."
        : error instanceof GoogleError && error.status === 404
          ? "The leads spreadsheet was deleted or moved. Reconnect Google Sheets to create a new one."
          : `Google Sheets: ${(error as Error).message}`;
    await prisma.integration.update({ where: { id: integration.id }, data: { lastError: message } });
    console.warn("[integrations] google sheets append failed:", (error as Error).message);
    return "failed";
  }
}

async function append(token: string, spreadsheetId: string, title: string, values: string[]) {
  const params = new URLSearchParams({ valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" });
  await google(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(rangeFor(title))}:append?${params}`,
    { method: "POST", token, body: JSON.stringify({ values: [values] }) },
  );
}
