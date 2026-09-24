import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getRedis, redisAvailable } from "@/lib/redis";

/**
 * The safety subsystem. Everything that keeps a creator's account healthy lives
 * here, and `dispatch.ts` is the only caller. Rules are sourced from
 * docs/META_API.md §5–§7 — read that before changing any number in this file.
 */

// --- 24-hour messaging window ----------------------------------------------

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Refresh a contact's window after any inbound interaction. */
export function windowExpiryFrom(interactionAt: Date): Date {
  return new Date(interactionAt.getTime() + WINDOW_MS);
}

export type WindowState = { open: boolean; expiresAt: Date | null; msRemaining: number };

export function evaluateWindow(contact: { windowExpiresAt: Date | null }, now = new Date()): WindowState {
  const expiresAt = contact.windowExpiresAt;
  if (!expiresAt) return { open: false, expiresAt: null, msRemaining: 0 };
  const msRemaining = expiresAt.getTime() - now.getTime();
  return { open: msRemaining > 0, expiresAt, msRemaining: Math.max(0, msRemaining) };
}

// --- One private reply per comment, ever ------------------------------------

/**
 * Instagram allows exactly ONE private reply per comment id. We claim the
 * comment atomically via a unique constraint so a duplicate webhook (which Meta
 * explicitly warns about on boosted posts) can never produce a second DM.
 *
 * Returns true if this caller won the claim.
 */
export async function claimCommentReply(
  accountId: string,
  igCommentId: string,
  kind: "private" | "public" = "private",
): Promise<boolean> {
  try {
    await prisma.commentReplyLog.create({ data: { accountId, igCommentId, kind } });
    return true;
  } catch {
    // Unique violation — already replied.
    return false;
  }
}

export async function releaseCommentReply(accountId: string, igCommentId: string, kind: "private" | "public") {
  await prisma.commentReplyLog
    .delete({ where: { accountId_igCommentId_kind: { accountId, igCommentId, kind } } })
    .catch(() => undefined);
}

/**
 * Private replies expire: 7 days for posts/reels/ads, and for Live comments
 * only while the broadcast is running.
 */
export function privateReplyStillAllowed(commentAt: Date, isLive: boolean, now = new Date()): boolean {
  if (isLive) {
    // Live comments can only be replied to during the broadcast. We approximate
    // "still live" generously at 15 minutes; the API is the real authority and
    // a rejection is recorded as a skip rather than an error.
    return now.getTime() - commentAt.getTime() < 15 * 60 * 1000;
  }
  return now.getTime() - commentAt.getTime() < 7 * 24 * 60 * 60 * 1000;
}

// --- Rate limiting ----------------------------------------------------------

export type RateClass = "message" | "private_reply" | "comment_reply";

function hourlyCap(rateClass: RateClass): number {
  switch (rateClass) {
    case "private_reply":
      return env.limits.privateRepliesPerHour;
    case "comment_reply":
      return env.limits.privateRepliesPerHour;
    case "message":
      return env.limits.messagesPerHour;
  }
}

export type RateDecision = { allowed: boolean; retryAfterMs: number; remaining: number };

/**
 * Sliding-window counter in Redis, per account per rate class. Falls open when
 * Redis is unavailable — the API's own limits are still the backstop, and
 * blocking every send because the cache is down would be worse.
 */
export async function checkRateLimit(
  accountId: string,
  rateClass: RateClass,
  slowedDown: boolean,
): Promise<RateDecision> {
  const cap = Math.floor(hourlyCap(rateClass) * (slowedDown ? 0.5 : 1));
  if (!(await redisAvailable())) return { allowed: true, retryAfterMs: 0, remaining: cap };

  const redis = getRedis();
  const bucket = Math.floor(Date.now() / 3_600_000);
  const key = `rl:${accountId}:${rateClass}:${bucket}`;

  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 3_700);

  if (used > cap) {
    const msIntoHour = Date.now() % 3_600_000;
    return { allowed: false, retryAfterMs: 3_600_000 - msIntoHour, remaining: 0 };
  }
  return { allowed: true, retryAfterMs: 0, remaining: cap - used };
}

/** Read-only view for the Safety Center. */
export async function rateLimitStatus(accountId: string, slowedDown: boolean) {
  const classes: RateClass[] = ["message", "private_reply"];
  if (!(await redisAvailable())) {
    return classes.map((c) => ({
      rateClass: c,
      used: 0,
      cap: Math.floor(hourlyCap(c) * (slowedDown ? 0.5 : 1)),
      unknown: true,
    }));
  }
  const redis = getRedis();
  const bucket = Math.floor(Date.now() / 3_600_000);
  return Promise.all(
    classes.map(async (c) => {
      const used = Number.parseInt((await redis.get(`rl:${accountId}:${c}:${bucket}`)) ?? "0", 10);
      return {
        rateClass: c,
        used,
        cap: Math.floor(hourlyCap(c) * (slowedDown ? 0.5 : 1)),
        unknown: false,
      };
    }),
  );
}

// --- Slow Down mode ---------------------------------------------------------

/** LinkDM's Slow Down Mode: halves throughput, auto-expires after 2 hours. */
export const SLOW_DOWN_MS = 2 * 60 * 60 * 1000;

export async function armSlowDown(accountId: string, reason: string): Promise<void> {
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: { slowDownUntil: new Date(Date.now() + SLOW_DOWN_MS), pausedReason: reason },
  });
}

export async function clearSlowDown(accountId: string): Promise<void> {
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: { slowDownUntil: null },
  });
}

export function isSlowedDown(account: { slowDownUntil: Date | null }, now = new Date()): boolean {
  return Boolean(account.slowDownUntil && account.slowDownUntil > now);
}

// --- Suppression / opt-out --------------------------------------------------

/**
 * Anyone can stop hearing from an automation by saying so. We honour the
 * common opt-out vocabulary regardless of what the creator configured.
 */
const OPT_OUT_WORDS = [
  "stop",
  "stopall",
  "unsubscribe",
  "unsub",
  "opt out",
  "optout",
  "quit",
  "cancel",
  "remove me",
  "no more",
  "leave me alone",
];

export function isOptOutMessage(text: string | undefined | null): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase().replace(/[^a-z\s]/g, "");
  if (normalized.length > 24) return false; // "stop" inside a sentence isn't an opt-out
  return OPT_OUT_WORDS.some((w) => normalized === w || normalized === `${w} please`);
}

export async function suppress(accountId: string, igsid: string, reason: string, note?: string) {
  await prisma.suppressionEntry
    .create({ data: { accountId, igsid, reason, note } })
    .catch(() => undefined);
  await prisma.contact
    .update({
      where: { accountId_igsid: { accountId, igsid } },
      data: { optedOut: true, optedOutAt: new Date() },
    })
    .catch(() => undefined);
}

export async function isSuppressed(accountId: string, igsid: string): Promise<boolean> {
  const entry = await prisma.suppressionEntry.findUnique({
    where: { accountId_igsid: { accountId, igsid } },
  });
  return Boolean(entry);
}

// --- Reasons a send can be skipped ------------------------------------------

export const SkipReason = {
  WINDOW_EXPIRED: "WINDOW_EXPIRED",
  ALREADY_REPLIED: "ALREADY_REPLIED",
  COMMENT_TOO_OLD: "COMMENT_TOO_OLD",
  RATE_LIMITED: "RATE_LIMITED",
  SUPPRESSED: "SUPPRESSED",
  OPTED_OUT: "OPTED_OUT",
  ACCOUNT_PAUSED: "ACCOUNT_PAUSED",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  HUMAN_TAKEOVER: "HUMAN_TAKEOVER",
  WORKSPACE_SUSPENDED: "WORKSPACE_SUSPENDED",
  IMPERSONATED_SESSION: "IMPERSONATED_SESSION",
  PLAN_LIMIT: "PLAN_LIMIT",
  PLAN_FEATURE: "PLAN_FEATURE",
} as const;

export type SkipReasonKey = (typeof SkipReason)[keyof typeof SkipReason];

/** Plain-language explanations shown in the UI. */
export const SKIP_EXPLANATIONS: Record<SkipReasonKey, string> = {
  WINDOW_EXPIRED:
    "Instagram's 24-hour messaging window closed before this step ran, so the message wasn't sent.",
  ALREADY_REPLIED: "Instagram allows one private reply per comment, and this comment already got one.",
  COMMENT_TOO_OLD:
    "Private replies expire 7 days after a comment — and as soon as a Live broadcast ends.",
  RATE_LIMITED: "The hourly sending limit for this account was reached. The message is queued to retry.",
  SUPPRESSED: "This person is on the suppression list.",
  OPTED_OUT: "This person opted out of automated messages.",
  ACCOUNT_PAUSED: "Automations are paused for this Instagram account.",
  NOT_CONFIGURED: "Instagram isn't connected yet, so nothing could be sent.",
  HUMAN_TAKEOVER: "A human took over this conversation, so automation is paused for the thread.",
  WORKSPACE_SUSPENDED:
    "This account is suspended, so nothing is being sent. Check the notice on sign-in.",
  IMPERSONATED_SESSION:
    "Support was viewing this account. Sessions opened by support can't send messages.",
  PLAN_LIMIT:
    "This month's automated DM allowance on your plan is used up. Upgrade, or it resets on the 1st. Replies you type yourself are never limited.",
  PLAN_FEATURE: "This step uses a feature your current plan doesn't include.",
};
