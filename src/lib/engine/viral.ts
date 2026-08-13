import { prisma } from "@/lib/db";
import { getRedis, redisAvailable } from "@/lib/redis";
import { armSlowDown } from "./guards";

/**
 * Viral Post Protection (SendDM).
 *
 * Slow Down mode already arms itself *after* Instagram throttles you. That's
 * reactive — by then you've already had requests rejected. This is the
 * proactive half: watch the rate of inbound triggers and slow down the moment a
 * post starts going off, before Instagram has any reason to complain.
 *
 * Counting happens in a Redis minute-bucket, so it costs one INCR per event.
 */

/** How many buckets to look back over when measuring the rate. */
const WINDOW_MINUTES = 3;

/** Don't re-arm more than once every 30 minutes — Slow Down lasts 2 hours. */
const RETRIGGER_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Record one inbound trigger and, if the rate has spiked, arm Slow Down.
 * Called from ingest on every event; must stay cheap and must never throw.
 */
export async function recordInboundAndCheckSpike(account: {
  id: string;
  viralProtection: boolean;
  viralThresholdPerMin: number;
  slowDownUntil: Date | null;
  lastViralTriggerAt: Date | null;
}): Promise<{ armed: boolean; ratePerMin: number } | null> {
  if (!account.viralProtection) return null;
  if (!(await redisAvailable())) return null;

  try {
    const redis = getRedis();
    const minute = Math.floor(Date.now() / 60_000);
    const key = `viral:${account.id}:${minute}`;

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, (WINDOW_MINUTES + 1) * 60);

    // Average over the trailing window so one noisy minute doesn't trip it.
    const keys = Array.from(
      { length: WINDOW_MINUTES },
      (_, i) => `viral:${account.id}:${minute - i}`,
    );
    const values = await redis.mget(...keys);
    const total = values.reduce((sum, v) => sum + (v ? Number.parseInt(v, 10) : 0), 0);
    const ratePerMin = Math.round(total / WINDOW_MINUTES);

    if (ratePerMin < account.viralThresholdPerMin) return { armed: false, ratePerMin };

    // Already slowed down, or armed very recently? Leave it alone.
    const now = Date.now();
    if (account.slowDownUntil && account.slowDownUntil.getTime() > now) {
      return { armed: false, ratePerMin };
    }
    if (
      account.lastViralTriggerAt &&
      now - account.lastViralTriggerAt.getTime() < RETRIGGER_COOLDOWN_MS
    ) {
      return { armed: false, ratePerMin };
    }

    await armSlowDown(
      account.id,
      `A post is going viral (~${ratePerMin} interactions a minute), so sending was slowed down automatically to protect the account.`,
    );
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { lastViralTriggerAt: new Date() },
    });

    console.log(`[viral] armed Slow Down for ${account.id} at ${ratePerMin}/min`);
    return { armed: true, ratePerMin };
  } catch (error) {
    // Protection failing must never stop an automation from running.
    console.warn("[viral] check failed", (error as Error).message);
    return null;
  }
}

/** Current inbound rate, for the Safety Center. */
export async function currentInboundRate(accountId: string): Promise<number | null> {
  if (!(await redisAvailable())) return null;
  try {
    const redis = getRedis();
    const minute = Math.floor(Date.now() / 60_000);
    const keys = Array.from({ length: WINDOW_MINUTES }, (_, i) => `viral:${accountId}:${minute - i}`);
    const values = await redis.mget(...keys);
    const total = values.reduce((sum, v) => sum + (v ? Number.parseInt(v, 10) : 0), 0);
    return Math.round(total / WINDOW_MINUTES);
  } catch {
    return null;
  }
}
