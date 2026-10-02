import { prisma } from "./db";
import { countEvents, utcDayStart, type StatRow } from "./engine/analytics";

/**
 * Read-side queries for the dashboard. Everything here is scoped by workspace —
 * callers pass a workspaceId that came from `requireWorkspace()`.
 */

export async function getAccountIds(workspaceId: string): Promise<string[]> {
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  return accounts.map((a) => a.id);
}

/**
 * Daily counts since `since`. Days before yesterday come from DailyStat (the
 * worker's rollup); yesterday and today are counted from the events
 * themselves, so a run shows up the moment it happens rather than after the
 * next rollup, and the day the rollup is still finishing isn't short.
 */
export async function getStatRows(accountIds: string[], since: Date): Promise<StatRow[]> {
  if (accountIds.length === 0) return [];
  const liveFrom = utcDayStart(1);
  const [rolled, live] = await Promise.all([
    since < liveFrom
      ? prisma.dailyStat.findMany({
          where: { accountId: { in: accountIds }, date: { gte: since, lt: liveFrom } },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    countEvents(accountIds, since > liveFrom ? since : liveFrom),
  ]);
  return [...rolled, ...live];
}

export type OverviewStats = {
  triggered: number;
  sent: number;
  opened: number;
  clicked: number;
  leads: number;
  newFollowers: number;
  ctr: number;
  openRate: number;
  contacts: number;
  activeAutomations: number;
  openConversations: number;
  series: Array<{ date: string; sent: number; opened: number; clicked: number; triggered: number }>;
};

export async function getOverviewStats(
  workspaceId: string,
  days = 14,
): Promise<OverviewStats> {
  const accountIds = await getAccountIds(workspaceId);

  const empty: OverviewStats = {
    triggered: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    leads: 0,
    newFollowers: 0,
    ctr: 0,
    openRate: 0,
    contacts: 0,
    activeAutomations: 0,
    openConversations: 0,
    series: buildEmptySeries(days),
  };
  if (accountIds.length === 0) return empty;

  const since = startOfDayUTC(new Date(Date.now() - (days - 1) * 86_400_000));

  const [stats, contacts, activeAutomations, openConversations] = await Promise.all([
    getStatRows(accountIds, since),
    prisma.contact.count({ where: { accountId: { in: accountIds } } }),
    prisma.automation.count({ where: { accountId: { in: accountIds }, enabled: true } }),
    prisma.conversation.count({
      where: { accountId: { in: accountIds }, status: "open", unreadCount: { gt: 0 } },
    }),
  ]);

  const byDate = new Map<string, { sent: number; opened: number; clicked: number; triggered: number }>();
  const totals = { triggered: 0, sent: 0, opened: 0, clicked: 0, leads: 0, newFollowers: 0 };

  for (const stat of stats) {
    totals.triggered += stat.triggered;
    totals.sent += stat.sent;
    totals.opened += stat.opened;
    totals.clicked += stat.clicked;
    totals.leads += stat.leads;
    totals.newFollowers += stat.newFollowers;

    const key = stat.date.toISOString().slice(0, 10);
    const bucket = byDate.get(key) ?? { sent: 0, opened: 0, clicked: 0, triggered: 0 };
    bucket.sent += stat.sent;
    bucket.opened += stat.opened;
    bucket.clicked += stat.clicked;
    bucket.triggered += stat.triggered;
    byDate.set(key, bucket);
  }

  const series = buildEmptySeries(days).map((point) => ({
    ...point,
    ...(byDate.get(point.date) ?? {}),
  }));

  return {
    ...totals,
    ctr: totals.sent > 0 ? totals.clicked / totals.sent : 0,
    openRate: totals.sent > 0 ? totals.opened / totals.sent : 0,
    contacts,
    activeAutomations,
    openConversations,
    series,
  };
}

function buildEmptySeries(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    return {
      date: date.toISOString().slice(0, 10),
      sent: 0,
      opened: 0,
      clicked: 0,
      triggered: 0,
    };
  });
}

export function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Per-automation performance, for the automations list and analytics table. */
export async function getAutomationPerformance(workspaceId: string, days = 30) {
  const accountIds = await getAccountIds(workspaceId);
  if (accountIds.length === 0) return [];

  const since = startOfDayUTC(new Date(Date.now() - (days - 1) * 86_400_000));

  const [automations, rows] = await Promise.all([
    prisma.automation.findMany({
      where: { accountId: { in: accountIds } },
      include: {
        account: { select: { username: true, profilePictureUrl: true } },
        flow: { select: { id: true, nodes: true } },
        _count: { select: { runs: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    getStatRows(accountIds, since),
  ]);

  const stats = new Map<string, { triggered: number; sent: number; opened: number; clicked: number; leads: number }>();
  for (const row of rows) {
    if (!row.automationId) continue;
    const sum = stats.get(row.automationId) ?? { triggered: 0, sent: 0, opened: 0, clicked: 0, leads: 0 };
    sum.triggered += row.triggered;
    sum.sent += row.sent;
    sum.opened += row.opened;
    sum.clicked += row.clicked;
    sum.leads += row.leads;
    stats.set(row.automationId, sum);
  }

  return automations.map((automation) => {
    const sum = stats.get(automation.id);
    const sent = sum?.sent ?? 0;
    const clicked = sum?.clicked ?? 0;
    const stepCount = Array.isArray(automation.flow?.nodes) ? automation.flow.nodes.length : 0;

    return {
      ...automation,
      stepCount,
      metrics: {
        triggered: sum?.triggered ?? 0,
        sent,
        opened: sum?.opened ?? 0,
        clicked,
        leads: sum?.leads ?? 0,
        ctr: sent > 0 ? clicked / sent : 0,
      },
    };
  });
}

/** Funnel for a single flow: how many runs reached each node. */
export async function getFlowFunnel(automationId: string) {
  const steps = await prisma.flowRunStep.groupBy({
    by: ["nodeId", "nodeType"],
    where: { flowRun: { automationId } },
    _count: { _all: true },
  });

  const runs = await prisma.flowRun.count({ where: { automationId } });

  return {
    totalRuns: runs,
    nodes: steps
      .map((step) => ({
        nodeId: step.nodeId,
        nodeType: step.nodeType,
        entered: step._count._all,
        rate: runs > 0 ? step._count._all / runs : 0,
      }))
      .sort((a, b) => b.entered - a.entered),
  };
}

/** Why messages didn't send — the Safety Center's main table. */
export async function getSkipBreakdown(workspaceId: string, days = 7) {
  const accountIds = await getAccountIds(workspaceId);
  if (accountIds.length === 0) return [];

  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.message.groupBy({
    by: ["skipReason"],
    where: {
      contact: { accountId: { in: accountIds } },
      status: "skipped",
      createdAt: { gte: since },
      skipReason: { not: null },
    },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({ reason: row.skipReason as string, count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Every tag in use on these accounts, with how many contacts carry it, for
 * pickers. Opted-out contacts aren't counted: nothing can be sent to them.
 */
export async function getTagCounts(accountIds: string[]): Promise<Record<string, Array<{ tag: string; count: number }>>> {
  if (accountIds.length === 0) return {};
  const rows = await prisma.$queryRaw<Array<{ accountId: string; tag: string; n: bigint }>>`
    SELECT "accountId", tag, count(*) AS n
    FROM "Contact", unnest("tags") AS tag
    WHERE "accountId" = ANY(${accountIds}) AND "optedOut" = false
    GROUP BY 1, 2
    ORDER BY n DESC, tag ASC`;
  const out: Record<string, Array<{ tag: string; count: number }>> = {};
  for (const row of rows) (out[row.accountId] ??= []).push({ tag: row.tag, count: Number(row.n) });
  return out;
}

/** The custom field names in use on these accounts, usable as {{tokens}}. */
export async function getCustomFieldKeys(accountIds: string[]): Promise<Record<string, string[]>> {
  if (accountIds.length === 0) return {};
  const rows = await prisma.$queryRaw<Array<{ accountId: string; key: string }>>`
    SELECT DISTINCT "accountId", jsonb_object_keys("customFields") AS key
    FROM "Contact"
    WHERE "accountId" = ANY(${accountIds}) AND jsonb_typeof("customFields") = 'object'
    ORDER BY 2
    LIMIT 500`;
  const out: Record<string, string[]> = {};
  // Only keys a token can name: letters, digits, underscores, dots.
  for (const row of rows) if (/^[\w.]+$/.test(row.key)) (out[row.accountId] ??= []).push(row.key);
  return out;
}
