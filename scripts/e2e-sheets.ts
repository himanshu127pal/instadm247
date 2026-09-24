/**
 * Google Sheets integration, run from e2e-check.ts. See docs/INTEGRATIONS.md.
 *
 * Google is stubbed at fetch: what's asserted is the exact requests we make —
 * scopes, the spreadsheet we create, the tab and header on first use, RAW
 * rows — and that tokens are never stored readable.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { decrypt } from "../src/lib/crypto";
import {
  PROVIDER,
  SCOPES,
  appendLead,
  authorizeUrl,
  connect,
  emailFromIdToken,
  tabTitle,
} from "../src/lib/integrations/google-sheets";
import { forwardLead } from "../src/lib/integrations";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

type Mutable = { billing: { enabled: boolean }; google: { clientId: string; clientSecret: string } };
const mutableEnv = env as unknown as Mutable;

type Call = { method: string; url: string; body: string };

export async function runSheetsChecks(prisma: PrismaClient, check: Check, section: Section) {
  const saved = {
    billing: mutableEnv.billing.enabled,
    id: mutableEnv.google.clientId,
    secret: mutableEnv.google.clientSecret,
  };
  mutableEnv.google.clientId = "e2e-client.apps.googleusercontent.com";
  mutableEnv.google.clientSecret = "e2e-secret";

  section("Google Sheets: sign-in");

  const auth = new URL(authorizeUrl("state123"));
  check("sign-in asks for offline access, so rows can be written later", auth.searchParams.get("access_type") === "offline");
  check(
    "it asks only for email and the files the app creates",
    auth.searchParams.get("scope") === SCOPES.join(" ") && !SCOPES.some((s) => /spreadsheets$|\/drive$/.test(s)),
  );
  check("the state is carried through", auth.searchParams.get("state") === "state123");
  const idToken = `x.${Buffer.from(JSON.stringify({ email: "creator@example.com" })).toString("base64url")}.y`;
  check("the Google account's email is read from the ID token", emailFromIdToken(idToken) === "creator@example.com");
  check("tab names lose the characters Sheets forbids", tabTitle("Giveaway: [VIP]/entries?") === "Giveaway VIP entries");

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e sheets ${tag}`, slug: `e2e-sheets-${tag}`, planKey: "pro" },
  });

  const calls: Call[] = [];
  const tabs = new Set<string>();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    if (!/googleapis\.com|accounts\.google\.com/.test(url)) return realFetch(input, init);
    const call = { method: init?.method ?? "GET", url, body: String(init?.body ?? "") };
    calls.push(call);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return json(200, { access_token: "at", expires_in: 3600, scope: "" });
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return json(200, {});
    if (url === "https://sheets.googleapis.com/v4/spreadsheets") return json(200, { spreadsheetId: "sheet_1" });
    if (url.includes("?fields=sheets.properties.title")) {
      return json(200, { sheets: [...tabs].map((title) => ({ properties: { title } })) });
    }
    if (url.includes(":batchUpdate")) {
      tabs.add(JSON.parse(call.body).requests[0].addSheet.properties.title);
      return json(200, {});
    }
    if (url.includes(":append")) return json(200, {});
    return json(404, { error: { message: "unexpected" } });
  }) as typeof fetch;

  try {
    // --- Connect ------------------------------------------------------------

    await connect(workspace.id, {
      access_token: "at",
      expires_in: 3600,
      refresh_token: "rt-secret-value",
      scope: SCOPES.join(" "),
      id_token: idToken,
    });
    const integration = await prisma.integration.findFirst({ where: { workspaceId: workspace.id, provider: PROVIDER } });
    check("connecting creates the leads spreadsheet", integration?.targetId === "sheet_1");
    check(
      "the refresh token is stored encrypted, not readable",
      Boolean(integration) && !integration!.apiKeyEnc.includes("rt-secret-value") && decrypt(integration!.apiKeyEnc) === "rt-secret-value",
    );
    check("the connected Google account is shown", Boolean(integration?.targetName?.includes("creator@example.com")));

    let threw = false;
    await connect(workspace.id, { access_token: "at", expires_in: 1, scope: "" }).catch(() => (threw = true));
    check("a sign-in without offline access is refused", threw);

    // --- Appending ------------------------------------------------------------

    section("Google Sheets: leads");

    const lead = (answers: Record<string, unknown>) => ({
      formName: "VIP list",
      questions: [
        { key: "f_email", label: "Email" },
        { key: "f_city", label: "City" },
      ],
      answers,
      username: "fan_one",
      name: "Fan One",
      at: new Date("2026-09-24T10:00:00Z"),
    });

    mutableEnv.billing.enabled = true;
    await prisma.workspace.update({ where: { id: workspace.id }, data: { planKey: "free" } });
    calls.length = 0;
    check("on Free the sync is paused", (await appendLead({ id: workspace.id, planKey: "free" }, lead({}))) === "skipped" && calls.length === 0);

    const pro = { id: workspace.id, planKey: "pro" };
    const first = await appendLead(pro, lead({ f_email: "a@example.com", f_city: "=HYPERLINK(\"http://evil\")" }));
    const appends = () => calls.filter((c) => c.url.includes(":append"));
    check("the first lead for a form is sent", first === "sent");
    check("it gets its own tab", calls.some((c) => c.url.includes(":batchUpdate") && c.body.includes("VIP list")));
    const [header, row] = appends().map((c) => JSON.parse(c.body).values[0] as string[]);
    check(
      "with a header row of the form's questions",
      JSON.stringify(header) === JSON.stringify(["Submitted (UTC)", "Instagram", "Name", "Email", "City"]),
    );
    check(
      "and the answers in the same order",
      JSON.stringify(row) === JSON.stringify(["2026-09-24 10:00:00", "@fan_one", "Fan One", "a@example.com", '=HYPERLINK("http://evil")']),
    );
    check("rows are written RAW, so an answer can never run as a formula", appends().every((c) => c.url.includes("valueInputOption=RAW")));
    check("the range is quoted for tab names with spaces", appends().every((c) => c.url.includes(encodeURIComponent("'VIP list'!A1"))));

    calls.length = 0;
    await appendLead(pro, lead({ f_email: "b@example.com" }));
    check("a second lead reuses the tab — no second header", !calls.some((c) => c.url.includes(":batchUpdate")) && appends().length === 1);

    // The token refresh works, but the spreadsheet has been deleted.
    globalThis.fetch = ((orig) =>
      (async (input: URL | string, init?: RequestInit) =>
        String(input).includes("?fields=") ? new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 }) : orig(input, init)))(globalThis.fetch) as typeof fetch;
    const gone = await appendLead(pro, lead({}));
    const after = await prisma.integration.findFirst({ where: { workspaceId: workspace.id, provider: PROVIDER } });
    check(
      "a deleted spreadsheet is reported on the integration, not thrown",
      gone === "failed" && Boolean(after?.lastError?.includes("Reconnect")),
    );

    const forwarded = await forwardLead(workspace.id, { email: "c@example.com" });
    check("email-tool forwarding leaves the Sheets integration alone", forwarded.length === 0);
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.billing.enabled = saved.billing;
    mutableEnv.google.clientId = saved.id;
    mutableEnv.google.clientSecret = saved.secret;
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
}
