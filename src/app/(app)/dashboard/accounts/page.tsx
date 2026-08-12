import { Aperture } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, isInstagramConfigured, missingInstagramConfig } from "@/lib/env";
import { REQUIRED_SCOPES, WEBHOOK_FIELDS } from "@/lib/meta/types";
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
          automationPaused: account.automationPaused,
          pausedReason: account.pausedReason,
          slowDownUntil: account.slowDownUntil?.toISOString() ?? null,
          tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
          lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
          scopes: account.scopes,
          counts: account._count,
        }))}
        configured={isInstagramConfigured()}
        missingConfig={missingInstagramConfig()}
        setup={{
          appUrl: env.appUrl,
          webhookUrl: `${env.appUrl}/api/webhooks/instagram`,
          redirectUri: env.meta.redirectUri,
          deauthorizeUrl: `${env.appUrl}/api/instagram/deauthorize`,
          deletionUrl: `${env.appUrl}/api/instagram/data-deletion`,
          verifyToken: env.meta.webhookVerifyToken,
          scopes: [...REQUIRED_SCOPES],
          webhookFields: [...WEBHOOK_FIELDS],
        }}
        flash={{ connected: params.connected, error: params.error }}
        icon={<Aperture className="h-5 w-5" />}
      />
    </div>
  );
}
