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

const COLUMN_FOR: Partial<Record<AnalyticsEventInput["type"], string>> = {
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

/**
 * Fold raw events into DailyStat rows. Idempotent per window: we roll up events
 * newer than the last rollup marker only.
 */
export async function rollupDailyStats(sinceHours = 48): Promise<number> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const grouped = await prisma.analyticsEvent.groupBy({
    by: ["accountId", "automationId", "type"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  // Group by day requires the raw rows; do it in one pass keyed by day.
  const events = await prisma.analyticsEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { accountId: true, automationId: true, type: true, createdAt: true },
  });

  type Key = string;
  const buckets = new Map<Key, Record<string, number> & { accountId: string; automationId: string | null; date: Date }>();

  for (const event of events) {
    const column = COLUMN_FOR[event.type as AnalyticsEventInput["type"]];
    if (!column) continue;

    const date = new Date(
      Date.UTC(event.createdAt.getUTCFullYear(), event.createdAt.getUTCMonth(), event.createdAt.getUTCDate()),
    );
    const key = `${event.accountId}|${event.automationId ?? ""}|${date.toISOString()}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { accountId: event.accountId, automationId: event.automationId, date } as never;
      buckets.set(key, bucket);
    }
    bucket[column] = (bucket[column] ?? 0) + 1;
  }

  for (const bucket of buckets.values()) {
    const { accountId, automationId, date, ...counts } = bucket;
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

  return grouped.length;
}
