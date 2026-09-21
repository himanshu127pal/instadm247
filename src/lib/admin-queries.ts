import { prisma } from "./db";

/**
 * Read models for the admin panel.
 *
 * These are the only queries in the codebase that deliberately cross the
 * tenancy boundary, so they live together rather than being scattered through
 * page components — it should be obvious where cross-customer reads happen.
 */

const DAY = 24 * 60 * 60 * 1000;

export type CustomerRow = {
  id: string;
  name: string;
  slug: string;
  planKey: string;
  createdAt: Date;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  ownerEmail: string | null;
  memberCount: number;
  accountCount: number;
  accountsNeedingAttention: number;
  contactCount: number;
  sent30d: number;
  lastActivityAt: Date | null;
};

export async function listCustomers(opts: { query?: string; limit?: number } = {}): Promise<CustomerRow[]> {
  const q = opts.query?.trim();
  const since = new Date(Date.now() - 30 * DAY);

  const workspaces = await prisma.workspace.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { memberships: { some: { user: { email: { contains: q, mode: "insensitive" } } } } },
            { accounts: { some: { username: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { email: true } } },
      },
      accounts: {
        select: { id: true, status: true, automationPaused: true, tokenExpiresAt: true, lastSyncAt: true },
      },
    },
  });

  const ids = workspaces.map((w) => w.id);
  if (ids.length === 0) return [];

  // Fold per-account rows back up to workspaces rather than issuing a count
  // per workspace. `take` caps the sent scan so one very busy month cannot
  // turn the customer list into a slow query.
  const accountWorkspace = new Map<string, string>();
  for (const w of workspaces) for (const a of w.accounts) accountWorkspace.set(a.id, w.id);

  const [contactRows, sentRows] = await Promise.all([
    prisma.contact.groupBy({
      by: ["accountId"],
      _count: { _all: true },
      where: { accountId: { in: [...accountWorkspace.keys()] } },
    }),
    prisma.message.findMany({
      where: {
        direction: "outbound",
        status: "sent",
        sentAt: { gte: since },
        contact: { accountId: { in: [...accountWorkspace.keys()] } },
      },
      select: { contact: { select: { accountId: true } } },
      take: 50_000,
    }),
  ]);

  const contactsByWorkspace = new Map<string, number>();
  for (const row of contactRows) {
    const ws = accountWorkspace.get(row.accountId);
    if (ws) contactsByWorkspace.set(ws, (contactsByWorkspace.get(ws) ?? 0) + row._count._all);
  }

  const sentByWorkspace = new Map<string, number>();
  for (const m of sentRows) {
    const ws = m.contact ? accountWorkspace.get(m.contact.accountId) : undefined;
    if (ws) sentByWorkspace.set(ws, (sentByWorkspace.get(ws) ?? 0) + 1);
  }

  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    planKey: w.planKey,
    createdAt: w.createdAt,
    suspendedAt: w.suspendedAt,
    suspendedReason: w.suspendedReason,
    ownerEmail: w.memberships[0]?.user.email ?? null,
    memberCount: w.memberships.length,
    accountCount: w.accounts.length,
    accountsNeedingAttention: w.accounts.filter(
      (a) =>
        a.status !== "connected" ||
        a.automationPaused ||
        (a.tokenExpiresAt !== null && a.tokenExpiresAt.getTime() < Date.now() + 7 * DAY),
    ).length,
    contactCount: contactsByWorkspace.get(w.id) ?? 0,
    sent30d: sentByWorkspace.get(w.id) ?? 0,
    lastActivityAt:
      w.accounts.map((a) => a.lastSyncAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ??
      null,
  }));
}

export async function getCustomer(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      memberships: { include: { user: true }, orderBy: { createdAt: "asc" } },
      accounts: { orderBy: { createdAt: "asc" } },
      adminNotes: { include: { author: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!workspace) return null;

  const accountIds = workspace.accounts.map((a) => a.id);
  const since = new Date(Date.now() - 30 * DAY);

  const [automations, contacts, sent30d, skips, recentSkips] = await Promise.all([
    prisma.automation.count({ where: { accountId: { in: accountIds } } }),
    prisma.contact.count({ where: { accountId: { in: accountIds } } }),
    prisma.message.count({
      where: { direction: "outbound", status: "sent", sentAt: { gte: since }, contact: { accountId: { in: accountIds } } },
    }),
    prisma.message.count({
      where: { direction: "outbound", status: "skipped", createdAt: { gte: since }, contact: { accountId: { in: accountIds } } },
    }),
    prisma.message.groupBy({
      by: ["skipReason"],
      _count: { _all: true },
      where: { status: "skipped", createdAt: { gte: since }, contact: { accountId: { in: accountIds } } },
      orderBy: { _count: { skipReason: "desc" } },
      take: 6,
    }),
  ]);

  return { workspace, stats: { automations, contacts, sent30d, skips }, recentSkips };
}

/** Numbers for the admin overview. */
export async function platformOverview() {
  const now = Date.now();
  const [workspaces, suspended, users, accounts, staleAccounts, pausedAccounts, sent24h, failed24h, newWorkspaces7d] =
    await Promise.all([
      prisma.workspace.count(),
      prisma.workspace.count({ where: { suspendedAt: { not: null } } }),
      prisma.user.count(),
      prisma.instagramAccount.count(),
      prisma.instagramAccount.count({
        where: {
          OR: [
            { status: { in: ["token_expired", "revoked"] } },
            { tokenExpiresAt: { lt: new Date(now + 7 * DAY) } },
          ],
        },
      }),
      prisma.instagramAccount.count({ where: { automationPaused: true } }),
      prisma.message.count({ where: { direction: "outbound", status: "sent", sentAt: { gte: new Date(now - DAY) } } }),
      prisma.message.count({ where: { direction: "outbound", status: "failed", createdAt: { gte: new Date(now - DAY) } } }),
      prisma.workspace.count({ where: { createdAt: { gte: new Date(now - 7 * DAY) } } }),
    ]);

  return { workspaces, suspended, users, accounts, staleAccounts, pausedAccounts, sent24h, failed24h, newWorkspaces7d };
}

/**
 * Accounts sending far more than the norm.
 *
 * This is the one that protects the business rather than the customer. Meta
 * grades a Tech Provider's app as a whole, so a single customer blasting DMs
 * can get *every* customer's integration restricted. Seeing the outlier early
 * is the difference between a quiet word and an app review.
 */
export async function sendingOutliers(hours = 24, limit = 15) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await prisma.message.groupBy({
    by: ["contactId"],
    _count: { _all: true },
    where: { direction: "outbound", status: "sent", sentAt: { gte: since } },
  });
  if (rows.length === 0) return [];

  const contacts = await prisma.contact.findMany({
    where: { id: { in: rows.map((r) => r.contactId).filter(Boolean) as string[] } },
    select: { id: true, account: { select: { id: true, username: true, workspaceId: true, workspace: { select: { name: true } } } } },
  });
  const byContact = new Map(contacts.map((c) => [c.id, c.account]));

  const perAccount = new Map<string, { username: string; workspaceId: string; workspaceName: string; sent: number }>();
  for (const r of rows) {
    const acc = r.contactId ? byContact.get(r.contactId) : undefined;
    if (!acc) continue;
    const cur = perAccount.get(acc.id) ?? {
      username: acc.username,
      workspaceId: acc.workspaceId,
      workspaceName: acc.workspace.name,
      sent: 0,
    };
    cur.sent += r._count._all;
    perAccount.set(acc.id, cur);
  }

  return [...perAccount.entries()]
    .map(([accountId, v]) => ({ accountId, ...v }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, limit);
}

export async function recentAudit(limit = 100) {
  return prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { email: true } } },
  });
}

// --- Webhook delivery log ---------------------------------------------------

export type WebhookRow = {
  id: string;
  field: string;
  createdAt: Date;
  processed: boolean;
  processedAt: Date | null;
  error: string | null;
  accountId: string | null;
  username: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
};

export type WebhookFilter = {
  workspaceId?: string;
  accountId?: string;
  field?: string;
  /** "all" | "failed" | "unprocessed" | "unmatched" */
  state?: string;
  limit?: number;
};

function webhookWhere(filter: WebhookFilter) {
  const where: Record<string, unknown> = {};
  if (filter.accountId) where.accountId = filter.accountId;
  else if (filter.workspaceId) where.account = { workspaceId: filter.workspaceId };
  if (filter.field) where.field = filter.field;

  // "unmatched" is the one that matters when nothing is firing: the delivery
  // arrived and was stored, but no account claimed it, so no flow ever ran.
  if (filter.state === "unmatched") where.accountId = null;
  else if (filter.state === "failed") where.error = { not: null };
  else if (filter.state === "unprocessed") where.processed = false;

  return where;
}

export async function listWebhookEvents(filter: WebhookFilter = {}): Promise<WebhookRow[]> {
  const rows = await prisma.webhookEvent.findMany({
    where: webhookWhere(filter),
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.limit ?? 100, 500),
    select: {
      id: true,
      field: true,
      createdAt: true,
      processed: true,
      processedAt: true,
      error: true,
      accountId: true,
      account: {
        select: { username: true, workspaceId: true, workspace: { select: { name: true } } },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    field: r.field,
    createdAt: r.createdAt,
    processed: r.processed,
    processedAt: r.processedAt,
    error: r.error,
    accountId: r.accountId,
    username: r.account?.username ?? null,
    workspaceId: r.account?.workspaceId ?? null,
    workspaceName: r.account?.workspace.name ?? null,
  }));
}

/** Counts for the filter chips, so an empty list is distinguishable from a filtered one. */
export async function webhookSummary(filter: WebhookFilter = {}): Promise<{
  total: number;
  failed: number;
  unprocessed: number;
  unmatched: number;
  last24h: number;
  lastAt: Date | null;
  byField: Array<{ field: string; count: number }>;
}> {
  const scope = { ...filter, state: undefined, field: undefined };
  const base = webhookWhere(scope);
  const since = new Date(Date.now() - DAY);

  const [total, failed, unprocessed, unmatched, last24h, latest, grouped] = await Promise.all([
    prisma.webhookEvent.count({ where: base }),
    prisma.webhookEvent.count({ where: { ...base, error: { not: null } } }),
    prisma.webhookEvent.count({ where: { ...base, processed: false } }),
    prisma.webhookEvent.count({ where: { ...base, accountId: null } }),
    prisma.webhookEvent.count({ where: { ...base, createdAt: { gte: since } } }),
    prisma.webhookEvent.findFirst({
      where: base,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.webhookEvent.groupBy({
      by: ["field"],
      where: base,
      _count: { field: true },
      orderBy: { _count: { field: "desc" } },
    }),
  ]);

  return {
    total,
    failed,
    unprocessed,
    unmatched,
    last24h,
    lastAt: latest?.createdAt ?? null,
    byField: grouped.map((g) => ({ field: g.field, count: g._count.field })),
  };
}

/** One event with its raw payload. Reading a payload is audited by the caller. */
export async function getWebhookEvent(id: string) {
  return prisma.webhookEvent.findUnique({
    where: { id },
    select: {
      id: true,
      field: true,
      payload: true,
      createdAt: true,
      processed: true,
      processedAt: true,
      error: true,
      accountId: true,
      account: {
        select: { username: true, workspaceId: true, workspace: { select: { name: true } } },
      },
    },
  });
}
