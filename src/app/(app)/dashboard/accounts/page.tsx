import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isInstagramConfigured } from "@/lib/env";
import { getLimits } from "@/lib/plan";
import { WEBHOOK_FIELDS } from "@/lib/meta/types";
import { PageHeader } from "@/components/dashboard/bits";
import { AccountsView } from "@/components/dashboard/accounts-view";
import { MetaBadge } from "@/components/marketing/meta-badge";

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

      <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
        <MetaBadge />
        You sign in on Instagram&rsquo;s own screen and choose what we can do; we never see your password.
        <Link href="/meta-tech-provider" className="font-semibold text-[var(--accent)] hover:underline">
          What this means
        </Link>
      </p>

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
          // Derived rather than stored: the canonical list lives in code, so a
          // field added later shows up as missing without a backfill.
          webhookMissingFields: WEBHOOK_FIELDS.filter(
            (f) => !account.webhookFields.includes(f),
          ),
          automationPaused: account.automationPaused,
          pausedReason: account.pausedReason,
          slowDownUntil: account.slowDownUntil?.toISOString() ?? null,
          tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
          lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
          scopes: account.scopes,
          counts: account._count,
        }))}
        configured={isInstagramConfigured()}
        accountLimit={
          Number.isFinite(getLimits(workspace).instagramAccounts)
            ? getLimits(workspace).instagramAccounts
            : null
        }
        flash={{ connected: params.connected, error: params.error }}
      />
    </div>
  );
}
