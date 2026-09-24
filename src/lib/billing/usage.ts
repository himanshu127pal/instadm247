import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getLimits } from "@/lib/plan";

/**
 * Monthly usage metering. See docs/BILLING.md §Metering.
 *
 * A quota is RESERVED before the action and RELEASED if the action does not
 * complete. The reservation is a single conditional UPDATE, so the check and the
 * increment are one atomic statement: two concurrent sends at 999/1000 cannot
 * both succeed. Prisma's query API cannot express a conditional increment, which
 * is why this is the one place the codebase uses raw SQL.
 */

export type Metric = "dms" | "ai_replies";

const LIMIT_FOR: Record<Metric, "dmsPerMonth" | "aiRepliesPerMonth"> = {
  dms: "dmsPerMonth",
  ai_replies: "aiRepliesPerMonth",
};

/** UTC calendar month, `YYYY-MM`. Usage resets on the 1st, not the billing date. */
export function periodKey(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
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
  const period = periodKey(at);
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
  const updated = await prisma.$executeRaw`
    UPDATE "UsageCounter" SET "count" = "count" + 1, "updatedAt" = now()
    WHERE "workspaceId" = ${workspace.id} AND "period" = ${period} AND "metric" = ${metric}
      AND "count" < ${limit}
  `;
  return updated > 0;
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
    WHERE "workspaceId" = ${workspaceId} AND "period" = ${periodKey(at)} AND "metric" = ${metric}
  `;
}

export type UsageSnapshot = Record<Metric, number>;

export async function getUsage(workspaceId: string, at: Date = new Date()): Promise<UsageSnapshot> {
  const rows = await prisma.usageCounter.findMany({
    where: { workspaceId, period: periodKey(at) },
    select: { metric: true, count: true },
  });
  const usage: UsageSnapshot = { dms: 0, ai_replies: 0 };
  for (const row of rows) if (row.metric in usage) usage[row.metric as Metric] = row.count;
  return usage;
}
