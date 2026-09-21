import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { subscribeAccountWebhooks } from "@/lib/meta/webhook-subscribe";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForToken, exchangeForLongLivedToken } from "@/lib/meta/oauth";
import { InstagramClient } from "@/lib/meta/client";
import { syncAccount } from "@/lib/meta/account";
import { REQUIRED_SCOPES } from "@/lib/meta/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth redirect target. Completes the connection and subscribes webhooks. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = (message: string, ok = false) =>
    NextResponse.redirect(
      new URL(`/dashboard/accounts?${ok ? "connected" : "error"}=${encodeURIComponent(message)}`, env.appUrl),
    );

  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) return settings(error);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return settings("Instagram didn't return an authorization code.");

  const jar = await cookies();
  const stored = jar.get("idm_oauth_state")?.value;
  jar.delete("idm_oauth_state");

  if (!stored) return settings("That connection link expired. Please try again.");
  const [expectedState, workspaceId] = stored.split(":");
  if (expectedState !== state) return settings("Security check failed. Please try connecting again.");

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    // The token exchange returns the app-scoped ID. Graph calls and webhook
    // payloads use the Instagram professional account ID, which only /me
    // reports, so the profile call has to happen before we decide what to store.
    const scopedId = String(shortLived.user_id);
    const client = new InstagramClient(longLived.access_token, scopedId);
    const profile = await client.getProfile();
    const igUserId = profile.user_id ? String(profile.user_id) : scopedId;

    const scopes = Array.isArray(shortLived.permissions)
      ? shortLived.permissions
      : typeof shortLived.permissions === "string"
        ? shortLived.permissions.split(",").map((s) => s.trim())
        : REQUIRED_SCOPES.slice();

    // An account connected before we knew the difference is stored under its
    // app-scoped ID, so upserting on igUserId alone would create a duplicate
    // row and orphan its automations. Match either identifier, then correct it.
    const existing = await prisma.instagramAccount.findFirst({
      where: { OR: [{ igUserId }, { igUserId: scopedId }, { igScopedId: scopedId }] },
      select: { id: true },
    });

    const account = await prisma.instagramAccount.upsert({
      where: existing ? { id: existing.id } : { igUserId },
      create: {
        workspaceId,
        igUserId,
        igScopedId: scopedId,
        username: profile.username,
        name: profile.name ?? null,
        profilePictureUrl: profile.profile_picture_url ?? null,
        accountType: profile.account_type ?? null,
        followersCount: profile.followers_count ?? 0,
        mediaCount: profile.media_count ?? 0,
        accessTokenEnc: encrypt(longLived.access_token),
        tokenExpiresAt: new Date(Date.now() + longLived.expires_in * 1000),
        lastRefreshAt: new Date(),
        scopes,
        status: "connected",
      },
      update: {
        workspaceId,
        igUserId,
        igScopedId: scopedId,
        username: profile.username,
        name: profile.name ?? null,
        profilePictureUrl: profile.profile_picture_url ?? null,
        followersCount: profile.followers_count ?? 0,
        mediaCount: profile.media_count ?? 0,
        accessTokenEnc: encrypt(longLived.access_token),
        tokenExpiresAt: new Date(Date.now() + longLived.expires_in * 1000),
        lastRefreshAt: new Date(),
        scopes,
        status: "connected",
        automationPaused: false,
        pausedReason: null,
      },
    });

    // Without this subscription no webhooks arrive and nothing automates. The
    // outcome is recorded on the account either way — a swallowed failure here
    // used to leave the dashboard advising a reconnect that could not help.
    const subscription = await subscribeAccountWebhooks(account.id);
    if (!subscription.ok) {
      console.error(`[oauth] webhook subscription failed: ${subscription.error}`);
    }

    // Best-effort media sync so the media picker is populated straight away.
    await syncAccount(account.id).catch(() => undefined);

    return settings(`@${profile.username} is connected.`, true);
  } catch (err) {
    console.error("[oauth] callback failed", err);
    return settings((err as Error).message ?? "Could not finish connecting to Instagram.");
  }
}
