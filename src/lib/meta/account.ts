import type { InstagramAccount } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { isInstagramConfigured } from "@/lib/env";
import { notifyInstagramReconnect } from "@/lib/email/notify";
import { InstagramClient } from "./client";
import { refreshLongLivedToken } from "./oauth";
import { MetaApiError } from "./types";

/**
 * Resolve a usable API client for a connected account.
 *
 * Returns null (rather than throwing) when the server has no Meta credentials
 * or the account is a demo/seeded account — callers treat that as "skip the
 * live call", which is what keeps the whole product explorable before the
 * owner adds META_APP_ID / META_APP_SECRET.
 */
export async function getClientForAccount(
  account: Pick<InstagramAccount, "id" | "igUserId" | "accessTokenEnc" | "status">,
): Promise<InstagramClient | null> {
  if (!isInstagramConfigured()) return null;
  if (account.status === "demo") return null;

  const token = decrypt(account.accessTokenEnc);
  if (!token) return null;

  return new InstagramClient(token, account.igUserId);
}

/** Same, but throws with an actionable message. Use in interactive routes. */
export async function requireClientForAccount(
  account: Pick<InstagramAccount, "id" | "igUserId" | "accessTokenEnc" | "status">,
): Promise<InstagramClient> {
  const client = await getClientForAccount(account);
  if (client) return client;

  if (!isInstagramConfigured()) {
    throw new MetaApiError(
      "Instagram isn't configured on this server yet. Add META_APP_ID and META_APP_SECRET, then restart.",
      503,
    );
  }
  if (account.status === "demo") {
    throw new MetaApiError("This is a demo account. Connect a real Instagram account first.", 400);
  }
  throw new MetaApiError("This account needs to be reconnected to Instagram.", 401);
}

export async function storeAccessToken(accountId: string, token: string, expiresInSeconds: number) {
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: {
      accessTokenEnc: encrypt(token),
      tokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      lastRefreshAt: new Date(),
      status: "connected",
    },
  });
}

const RECONNECT_REASON = "Instagram access expired. Reconnect the account to resume automations.";

/**
 * Instagram stopped accepting this account's token: pause it and tell the
 * owner. The update is conditional on the account not already being marked,
 * so the burst of sends that fail together when a token dies sends one email.
 */
export async function markReconnectNeeded(accountId: string): Promise<void> {
  const changed = await prisma.instagramAccount.updateMany({
    where: { id: accountId, status: { notIn: ["token_expired", "revoked", "demo"] } },
    data: { status: "token_expired", automationPaused: true, pausedReason: RECONNECT_REASON },
  });
  if (changed.count === 0) return;

  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
    select: { id: true, workspaceId: true, username: true, lastRefreshAt: true },
  });
  if (account) {
    await notifyInstagramReconnect(account).catch((error) =>
      console.error("[account] reconnect email failed", error),
    );
  }
}

/**
 * Refresh tokens approaching expiry. Long-lived tokens last 60 days; we renew
 * at 15 days remaining so a few failed attempts still leave plenty of runway.
 */
export async function refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
  if (!isInstagramConfigured()) return { refreshed: 0, failed: 0 };

  const threshold = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  const accounts = await prisma.instagramAccount.findMany({
    where: {
      status: "connected",
      accessTokenEnc: { not: null },
      tokenExpiresAt: { lt: threshold },
    },
  });

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts) {
    const token = decrypt(account.accessTokenEnc);
    if (!token) continue;
    try {
      const next = await refreshLongLivedToken(token);
      await storeAccessToken(account.id, next.access_token, next.expires_in);
      refreshed++;
    } catch (error) {
      failed++;
      // Anything else — a network error, Meta having a bad minute — is retried
      // on the next run; there's plenty of runway before the token lapses.
      if (error instanceof MetaApiError && error.isAuthError) await markReconnectNeeded(account.id);
    }
  }

  return { refreshed, failed };
}

/** Pull profile + recent media into our cache so the UI is fast and API-light. */
export async function syncAccount(accountId: string): Promise<{ media: number } | null> {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;

  const client = await getClientForAccount(account);
  if (!client) return null;

  const profile = await client.getProfile();
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: {
      username: profile.username,
      name: profile.name ?? null,
      profilePictureUrl: profile.profile_picture_url ?? null,
      accountType: profile.account_type ?? null,
      followersCount: profile.followers_count ?? 0,
      mediaCount: profile.media_count ?? 0,
      lastSyncAt: new Date(),
    },
  });

  const media = await client.getMedia(50);
  for (const item of media) {
    await prisma.media.upsert({
      where: { accountId_igMediaId: { accountId, igMediaId: item.id } },
      create: {
        accountId,
        igMediaId: item.id,
        caption: item.caption ?? null,
        mediaType: item.media_type ?? null,
        mediaUrl: item.media_url ?? null,
        thumbnailUrl: item.thumbnail_url ?? null,
        permalink: item.permalink ?? null,
        timestamp: item.timestamp ? new Date(item.timestamp) : null,
        commentsCount: item.comments_count ?? 0,
        likeCount: item.like_count ?? 0,
      },
      update: {
        caption: item.caption ?? null,
        commentsCount: item.comments_count ?? 0,
        likeCount: item.like_count ?? 0,
        // Instagram's media links expire; keep the latest ones.
        mediaUrl: item.media_url ?? null,
        thumbnailUrl: item.thumbnail_url ?? null,
        permalink: item.permalink ?? null,
      },
    });
  }

  return { media: media.length };
}
