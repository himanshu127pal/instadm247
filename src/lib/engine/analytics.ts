import { prisma } from "@/lib/db";

/**
 * Append-only analytics events, rolled up into DailyStat by the maintenance
 * worker. Writing an event must never break a flow, so every call swallows its
 * own errors.
 */

export type AnalyticsEventInput = {
  accountId: string;
  automationId?: string | null;
  contactId?: string | null;
  type:
    | "trigger_fired"
    | "message_sent"
    | "message_delivered"
    | "message_seen"
    | "link_clicked"
    | "follow_gained"
    | "form_completed"
    | "node_entered"
    | "flow_completed"
    | "goal_reached"
    | "send_skipped"
    | "send_failed";
  nodeId?: string | null;
  value?: number;
  meta?: Record<string, unknown>;
};

export async function recordEvent(input: AnalyticsEventInput): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        accountId: input.accountId,
        automationId: input.automationId ?? null,
        contactId: input.contactId ?? null,
        type: input.type,
        nodeId: input.nodeId ?? null,
        value: input.value ?? null,
        meta: (input.meta ?? {}) as object,
      },
    });
  } catch (error) {
    console.error("[analytics] failed to record event", input.type, error);
  }
}

export const STAT_COLUMNS = [
  "triggered", "sent", "delivered", "opened", "clicked", "failed", "skipped", "newFollowers", "leads",
] as const;
export type StatColumn = (typeof STAT_COLUMNS)[number];
export type StatCounts = Record<StatColumn, number>;

export const COLUMN_FOR: Partial<Record<AnalyticsEventInput["type"], StatColumn>> = {
  trigger_fired: "triggered",
  message_sent: "sent",
  message_delivered: "delivered",
  message_seen: "opened",
  link_clicked: "clicked",
  send_failed: "failed",
  send_skipped: "skipped",
  follow_gained: "newFollowers",
  form_completed: "leads",
};

export function emptyCounts(): StatCounts {
  return Object.fromEntries(STAT_COLUMNS.map((c) => [c, 0])) as StatCounts;
}

export type StatRow = StatCounts & { accountId: string; automationId: string | null; date: Date };

/**
 * Events since `since`, counted per account, automation and UTC day, in the
 * same shape as DailyStat. Counted in the database: a busy account can log a
 * lot of events in a day, and only the totals are needed.
 */
export async function countEvents(accountIds: string[] | "all", since: Date): Promise<StatRow[]> {
  if (accountIds !== "all" && accountIds.length === 0) return [];
  const types = Object.keys(COLUMN_FOR);
  type Row = { accountId: string; automationId: string | null; type: string; day: Date; n: bigint };
  const rows =
    accountIds === "all"
      ? await prisma.$queryRaw<Row[]>`
          SELECT "accountId", "automationId", "type", date_trunc('day', "createdAt") AS day, count(*) AS n
          FROM "AnalyticsEvent"
          WHERE "createdAt" >= ${since} AND "type" = ANY(${types})
          GROUP BY 1, 2, 3, 4`
      : await prisma.$queryRaw<Row[]>`
          SELECT "accountId", "automationId", "type", date_trunc('day', "createdAt") AS day, count(*) AS n
          FROM "AnalyticsEvent"
          WHERE "accountId" = ANY(${accountIds}) AND "createdAt" >= ${since} AND "type" = ANY(${types})
          GROUP BY 1, 2, 3, 4`;

  const buckets = new Map<string, StatRow>();
  for (const row of rows) {
    const column = COLUMN_FOR[row.type as AnalyticsEventInput["type"]];
    if (!column) continue;
    const date = new Date(Date.UTC(row.day.getUTCFullYear(), row.day.getUTCMonth(), row.day.getUTCDate()));
    const key = `${row.accountId}|${row.automationId ?? ""}|${date.toISOString()}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { accountId: row.accountId, automationId: row.automationId, date, ...emptyCounts() };
      buckets.set(key, bucket);
    }
    bucket[column] += Number(row.n);
  }
  return [...buckets.values()];
}

/** Midnight UTC, `daysAgo` days back. */
export function utcDayStart(daysAgo = 0, now = Date.now()): Date {
  const d = new Date(now - daysAgo * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Fold raw events into DailyStat rows, recounting whole UTC days so each row
 * is the complete count for its day, however often this runs. (It used to
 * count the last 48 hours and write that over the row, which left the oldest
 * day in the window holding only part of its events.)
 *
 * Dashboards read today and yesterday from the events directly (see
 * `src/lib/queries.ts`), so numbers don't wait for this to run.
 */
export async function rollupDailyStats(days = 3, now = Date.now()): Promise<number> {
  const rows = await countEvents("all", utcDayStart(days - 1, now));

  for (const row of rows) {
    const { accountId, automationId, date, ...counts } = row;
    // Prisma can't target a compound unique that contains a NULL, so upsert by
    // hand: automationId is null for account-level (non-automation) events.
    const existing = await prisma.dailyStat.findFirst({
      where: { accountId, automationId: automationId ?? null, date },
      select: { id: true },
    });
    if (existing) {
      await prisma.dailyStat.update({ where: { id: existing.id }, data: counts });
    } else {
      await prisma.dailyStat.create({
        data: { accountId, automationId: automationId ?? null, date, ...counts },
      });
    }
  }

  return rows.length;
}
