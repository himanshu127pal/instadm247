import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccountIds, getCustomFieldKeys, getTagCounts } from "@/lib/queries";
import { PageHeader } from "@/components/dashboard/bits";
import { BroadcastsView } from "@/components/dashboard/broadcasts-view";

export default async function BroadcastsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const accountIds = await getAccountIds(workspace.id);

  const [accounts, broadcasts, segments, reachableCount, tagsByAccount, fieldsByAccount] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, username: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.broadcast.findMany({
      where: { workspaceId: workspace.id },
      include: { account: { select: { username: true } }, segment: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.segment.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.count({
      where: {
        accountId: { in: accountIds },
        optedOut: false,
        windowExpiresAt: { gt: new Date() },
      },
    }),
    getTagCounts(accountIds),
    getCustomFieldKeys(accountIds),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Broadcasts"
        description="Message the people whose 24-hour window is still open, or set up a recurring nudge for contacts who've gone quiet."
      />
      <BroadcastsView
        accounts={accounts}
        segments={segments.map((s) => ({ id: s.id, name: s.name }))}
        reachableCount={reachableCount}
        tagsByAccount={tagsByAccount}
        fieldsByAccount={fieldsByAccount}
        broadcasts={broadcasts.map((b) => ({
          id: b.id,
          name: b.name,
          kind: b.kind,
          status: b.status,
          accountUsername: b.account.username,
          segmentName: b.segment?.name ?? null,
          scheduledAt: b.scheduledAt?.toISOString() ?? null,
          completedAt: b.completedAt?.toISOString() ?? null,
          sentCount: b.sentCount,
          skippedCount: b.skippedCount,
          failedCount: b.failedCount,
          recurring: b.recurring,
          reengageAfterHours: b.reengageAfterHours,
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
