import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/bits";
import { TemplatesView } from "@/components/dashboard/templates-view";

export default async function TemplatesPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [templates, links, accounts, iceBreakers, pools] = await Promise.all([
    prisma.template.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.trackedLink.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, username: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.iceBreaker.findMany({
      where: { account: { workspaceId: workspace.id } },
      include: { account: { select: { username: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.couponPool.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { codes: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Remaining-code counts, so the UI can warn before a pool runs dry.
  const poolsWithStats = await Promise.all(
    pools.map(async (pool) => {
      const issued = await prisma.couponCode.count({
        where: { poolId: pool.id, contactId: { not: null } },
      });
      return {
        id: pool.id,
        name: pool.name,
        mode: pool.mode,
        sharedCode: pool.sharedCode,
        description: pool.description,
        expiresAt: pool.expiresAt?.toISOString() ?? null,
        stats: {
          total: pool._count.codes,
          issued,
          remaining: pool._count.codes - issued,
        },
      };
    }),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Templates & assets"
        description="Reusable messages, tracked links, coupon pools, and the conversation starters people see in your Instagram inbox."
      />
      <TemplatesView
        appUrl={env.appUrl}
        accounts={accounts}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          payload: t.payload as { kind: string; text?: string },
          updatedAt: t.updatedAt.toISOString(),
        }))}
        links={links.map((l) => ({
          id: l.id,
          code: l.code,
          destination: l.destination,
          label: l.label,
          clickCount: l.clickCount,
        }))}
        pools={poolsWithStats}
        iceBreakers={iceBreakers.map((i) => ({
          id: i.id,
          accountId: i.accountId,
          accountUsername: i.account.username,
          question: i.question,
          order: i.order,
        }))}
      />
    </div>
  );
}
