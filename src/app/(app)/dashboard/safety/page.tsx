import { ShieldCheck } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccountIds, getSkipBreakdown } from "@/lib/queries";
import { SKIP_EXPLANATIONS, rateLimitStatus, type SkipReasonKey } from "@/lib/engine/guards";
import { PageHeader } from "@/components/dashboard/bits";
import { SafetyView } from "@/components/dashboard/safety-view";

export default async function SafetyPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const accountIds = await getAccountIds(workspace.id);

  const [accounts, skips, recentFailures, suppressions, policyEvents] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: {
        id: true,
        username: true,
        status: true,
        automationPaused: true,
        pausedReason: true,
        slowDownUntil: true,
        tokenExpiresAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    getSkipBreakdown(workspace.id, 7),
    prisma.message.findMany({
      where: {
        contact: { accountId: { in: accountIds } },
        status: "failed",
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      include: { contact: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.suppressionEntry.count({ where: { accountId: { in: accountIds } } }),
    prisma.webhookEvent.count({
      where: {
        accountId: { in: accountIds },
        field: "policy_enforcement",
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
  ]);

  const limits = await Promise.all(
    accounts.map(async (account) => ({
      accountId: account.id,
      username: account.username,
      classes: await rateLimitStatus(
        account.id,
        Boolean(account.slowDownUntil && account.slowDownUntil > new Date()),
      ),
    })),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Safety Center"
        description="Everything the dispatcher checks before a message goes out — and every message it decided not to send, with the reason."
      />

      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--color-boom-400)]/30 shadow-[4px_4px_0_0_var(--shadow-ink)] p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-boom-500)]" />
        <div>
          <p className="text-[14px] font-medium">Only official Instagram endpoints are used</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
            Every outbound message passes through a single dispatcher that enforces the
            24-hour messaging window, the one-private-reply-per-comment rule, per-account
            rate limits and your suppression list. When a message can&rsquo;t be sent
            legally, it&rsquo;s recorded as skipped rather than attempted.
          </p>
        </div>
      </div>

      <SafetyView
        accounts={accounts.map((a) => ({
          ...a,
          slowDownUntil: a.slowDownUntil?.toISOString() ?? null,
          tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
        }))}
        limits={limits}
        skips={skips.map((s) => ({
          ...s,
          label: humanLabel(s.reason as SkipReasonKey),
          explanation: SKIP_EXPLANATIONS[s.reason as SkipReasonKey] ?? s.reason,
        }))}
        failures={recentFailures.map((m) => ({
          id: m.id,
          username: m.contact.username,
          reason: m.failReason,
          createdAt: m.createdAt.toISOString(),
        }))}
        suppressions={suppressions}
        policyEvents={policyEvents}
      />
    </div>
  );
}

function humanLabel(reason: SkipReasonKey): string {
  const map: Record<string, string> = {
    WINDOW_EXPIRED: "Window closed",
    ALREADY_REPLIED: "Comment already replied",
    COMMENT_TOO_OLD: "Comment too old",
    RATE_LIMITED: "Rate limited",
    SUPPRESSED: "Suppressed",
    OPTED_OUT: "Opted out",
    ACCOUNT_PAUSED: "Account paused",
    NOT_CONFIGURED: "Not configured",
    HUMAN_TAKEOVER: "You took over",
  };
  return map[reason] ?? reason;
}
