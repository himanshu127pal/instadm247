import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getLimits } from "@/lib/plan";
import { notifyUsageIfCrossed } from "@/lib/email/notify";

/**
 * Usage metering. See docs/BILLING.md §Metering. DMs and AI replies are counted
 * per calendar month; AI Helper questions per week, so a customer who runs out
 * waits days, not weeks.
 *
 * A quota is RESERVED before the action and RELEASED if the action does not
 * complete. The reservation is a single conditional UPDATE, so the check and the
 * increment are one atomic statement: two concurrent sends at 999/1000 cannot
 * both succeed. Prisma's query API cannot express a conditional increment, which
 * is why this is the one place the codebase uses raw SQL.
 */

export type Metric = "dms" | "ai_replies" | "helper";

const LIMIT_FOR: Record<Metric, "dmsPerMonth" | "aiRepliesPerMonth" | "helperQuestionsPerWeek"> = {
  dms: "dmsPerMonth",
  ai_replies: "aiRepliesPerMonth",
  helper: "helperQuestionsPerWeek",
};

/** UTC calendar month, `YYYY-MM`. Usage resets on the 1st, not the billing date. */
export function periodKey(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ISO week in UTC, `YYYY-Www`. Weeks start on Monday 00:00 UTC. */
export function weekKey(at: Date = new Date()): string {
  // The ISO year is the year of the week's Thursday.
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** When the week containing `at` ends: the next Monday, 00:00 UTC. */
export function nextWeekStart(at: Date = new Date()): Date {
  const day = at.getUTCDay() || 7;
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 8 - day));
}

/** The counter row a metric uses at a moment: a month, or for the helper a week. */
export function periodFor(metric: Metric, at: Date = new Date()): string {
  return metric === "helper" ? weekKey(at) : periodKey(at);
}

async function ensureRow(workspaceId: string, period: string, metric: Metric): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "UsageCounter" ("id", "workspaceId", "period", "metric", "count", "updatedAt")
    VALUES (${randomUUID()}, ${workspaceId}, ${period}, ${metric}, 0, now())
    ON CONFLICT ("workspaceId", "period", "metric") DO NOTHING
  `;
}

/**
 * Take one unit of `metric` for this month if the plan allows it.
 *
 * Returns true if reserved. When the limit is Infinity the reservation always
 * succeeds — but it is still counted, so usage history exists the day billing is
 * switched on.
 */
export async function reserveUsage(
  workspace: { id: string; planKey?: string | null },
  metric: Metric,
  at: Date = new Date(),
): Promise<boolean> {
  const period = periodFor(metric, at);
  const limit = getLimits(workspace)[LIMIT_FOR[metric]];

  await ensureRow(workspace.id, period, metric);

  if (!Number.isFinite(limit)) {
    await prisma.$executeRaw`
      UPDATE "UsageCounter" SET "count" = "count" + 1, "updatedAt" = now()
      WHERE "workspaceId" = ${workspace.id} AND "period" = ${period} AND "metric" = ${metric}
    `;
    return true;
  }

  // The WHERE clause is the limit check. Zero rows updated means the counter
  // was already at the limit, and nothing was changed.
  const updated = await prisma.$queryRaw<{ count: number }[]>`
    UPDATE "UsageCounter" SET "count" = "count" + 1, "updatedAt" = now()
    WHERE "workspaceId" = ${workspace.id} AND "period" = ${period} AND "metric" = ${metric}
      AND "count" < ${limit}
    RETURNING "count"
  `;
  if (updated.length === 0) return false;

  // The count this reservation produced. Exactly one reservation lands on each
  // warning threshold, so this is where the "80% used" email comes from. The
  // helper has no email: running low is shown on its own page, and nothing a
  // customer's followers see depends on it.
  if (metric !== "helper") {
    await notifyUsageIfCrossed(workspace, metric, Number(updated[0].count), period, at).catch((error) =>
      console.error("[usage] threshold email failed", error),
    );
  }
  return true;
}

/**
 * Give a reserved unit back because the action did not happen. Takes the same
 * `at` as the reservation, so a send that straddles midnight on the last day of
 * the month is returned to the month it was taken from.
 */
export async function releaseUsage(
  workspaceId: string,
  metric: Metric,
  at: Date = new Date(),
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "UsageCounter" SET "count" = GREATEST("count" - 1, 0), "updatedAt" = now()
    WHERE "workspaceId" = ${workspaceId} AND "period" = ${periodFor(metric, at)} AND "metric" = ${metric}
  `;
}

/** This month's DMs and AI replies, and this week's AI Helper questions. */
export type UsageSnapshot = Record<Metric, number>;

export async function getUsage(workspaceId: string, at: Date = new Date()): Promise<UsageSnapshot> {
  const rows = await prisma.usageCounter.findMany({
    where: { workspaceId, period: { in: [periodKey(at), weekKey(at)] } },
    select: { metric: true, period: true, count: true },
  });
  const usage: UsageSnapshot = { dms: 0, ai_replies: 0, helper: 0 };
  for (const row of rows) {
    if (row.metric in usage && row.period === periodFor(row.metric as Metric, at)) {
      usage[row.metric as Metric] = row.count;
    }
  }
  return usage;
}
