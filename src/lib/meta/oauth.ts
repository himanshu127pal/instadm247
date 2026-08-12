import { env, isInstagramConfigured } from "@/lib/env";
import { MetaApiError, REQUIRED_SCOPES } from "./types";

/**
 * Business Login for Instagram — the OAuth flow that connects a creator's
 * Instagram professional account without requiring a linked Facebook Page.
 * Full flow documented in docs/META_API.md §3.
 */

const AUTH_HOST = "https://www.instagram.com";
const API_HOST = "https://api.instagram.com";
const GRAPH_HOST = "https://graph.instagram.com";

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(`${AUTH_HOST}/oauth/authorize`);
  url.searchParams.set("client_id", env.meta.appId);
  url.searchParams.set("redirect_uri", env.meta.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export type ShortLivedToken = {
  access_token: string;
  user_id: string | number;
  permissions?: string | string[];
};

/** Step 2: authorization code → short-lived token. */
export async function exchangeCodeForToken(code: string): Promise<ShortLivedToken> {
  assertConfigured();
  const body = new URLSearchParams({
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    grant_type: "authorization_code",
    redirect_uri: env.meta.redirectUri,
    // Instagram appends #_ to the code on redirect; it must be stripped.
    code: code.replace(/#_$/, ""),
  });

  const res = await fetch(`${API_HOST}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json = await readJson(res);
  if (!res.ok) throw toError(json, res.status, "Could not exchange the authorization code");
  return json as ShortLivedToken;
}

export type LongLivedToken = { access_token: string; token_type?: string; expires_in: number };

/** Step 3: short-lived → long-lived (60 day) token. */
export async function exchangeForLongLivedToken(shortLived: string): Promise<LongLivedToken> {
  assertConfigured();
  const url = new URL(`${GRAPH_HOST}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env.meta.appSecret);
  url.searchParams.set("access_token", shortLived);

  const res = await fetch(url, { cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok) throw toError(json, res.status, "Could not obtain a long-lived token");
  return json as LongLivedToken;
}

/**
 * Refresh a long-lived token. Meta requires the token to be at least 24h old
 * and not yet expired — the maintenance job refreshes at ~45 days of age.
 */
export async function refreshLongLivedToken(token: string): Promise<LongLivedToken> {
  assertConfigured();
  const url = new URL(`${GRAPH_HOST}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok) throw toError(json, res.status, "Could not refresh the access token");
  return json as LongLivedToken;
}

function assertConfigured() {
  if (!isInstagramConfigured()) {
    throw new MetaApiError(
      "Instagram is not configured on this server. Add META_APP_ID and META_APP_SECRET.",
      503,
    );
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function toError(json: Record<string, unknown>, status: number, fallback: string): MetaApiError {
  const err = (json.error ?? json) as Record<string, unknown>;
  const message =
    (typeof err.message === "string" && err.message) ||
    (typeof err.error_message === "string" && err.error_message) ||
    fallback;
  return new MetaApiError(
    message,
    status,
    typeof err.code === "number" ? err.code : undefined,
    typeof err.error_subcode === "number" ? err.error_subcode : undefined,
  );
}
