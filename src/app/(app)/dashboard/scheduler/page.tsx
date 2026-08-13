import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isInstagramConfigured } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/bits";
import { SchedulerView } from "@/components/dashboard/scheduler-view";

export default async function SchedulerPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [accounts, posts, automations] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, username: true, scopes: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.scheduledPost.findMany({
      where: { account: { workspaceId: workspace.id } },
      include: { account: { select: { username: true } } },
      orderBy: { scheduledAt: "desc" },
      take: 50,
    }),
    prisma.automation.findMany({
      where: { account: { workspaceId: workspace.id } },
      select: { id: true, name: true, accountId: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Scheduler"
        description="Schedule posts and Reels, and switch an automation on the moment they go live."
      />
      <SchedulerView
        accounts={accounts}
        automations={automations}
        configured={isInstagramConfigured()}
        posts={posts.map((post) => ({
          id: post.id,
          accountUsername: post.account.username,
          mediaType: post.mediaType,
          caption: post.caption,
          mediaUrls: post.mediaUrls,
          scheduledAt: post.scheduledAt.toISOString(),
          publishedAt: post.publishedAt?.toISOString() ?? null,
          status: post.status,
          error: post.error,
          attachAutomationIds: post.attachAutomationIds,
        }))}
      />
    </div>
  );
}
