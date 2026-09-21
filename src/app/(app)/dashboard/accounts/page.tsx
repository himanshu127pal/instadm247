import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isInstagramConfigured } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/bits";
import { AccountsView } from "@/components/dashboard/accounts-view";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    include: {
      _count: { select: { automations: true, contacts: true, media: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Instagram accounts"
        description="Connect the professional accounts you want to automate. You can connect as many as you like."
      />

      <AccountsView
        accounts={accounts.map((account) => ({
          id: account.id,
          username: account.username,
          name: account.name,
          profilePictureUrl: account.profilePictureUrl,
          accountType: account.accountType,
          followersCount: account.followersCount,
          status: account.status,
          webhookSubbed: account.webhookSubbed,
          webhookError: account.webhookError,
          webhookFields: account.webhookFields,
          automationPaused: account.automationPaused,
          pausedReason: account.pausedReason,
          slowDownUntil: account.slowDownUntil?.toISOString() ?? null,
          tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
          lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
          scopes: account.scopes,
          counts: account._count,
        }))}
        configured={isInstagramConfigured()}
        flash={{ connected: params.connected, error: params.error }}
      />
    </div>
  );
}
