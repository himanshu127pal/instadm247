import { CheckCircle2, Clock } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, isBillingConfigured } from "@/lib/env";
import { getPlatformStaff } from "@/lib/admin";
import { isImpersonating } from "@/lib/impersonation";
import { PLANS, planFor } from "@/lib/billing/plans";
import { getUsage } from "@/lib/billing/usage";
import { PageHeader, SectionCard } from "@/components/dashboard/bits";
import { PlanCards } from "@/components/billing/plan-cards";
import { ManageSubscriptionButton } from "@/components/billing/manage-button";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Meter({ label, used, cap, hint }: { label: string; used: number; cap: number; hint?: string }) {
  const finite = Number.isFinite(cap);
  const pct = finite && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13.5px] font-bold">{label}</p>
        <p className="text-[13px] font-semibold tabular-nums text-[var(--text-muted)]">
          {formatNumber(used)} of {finite ? formatNumber(cap) : "unlimited"}
        </p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-[var(--border-soft)] bg-[var(--bg-sunken)]">
        <div
          className={
            pct >= 100
              ? "h-full bg-[var(--color-zonk-500)]"
              : pct >= 80
                ? "h-full bg-[var(--color-zap-500)]"
                : "h-full bg-[var(--color-boom-500)]"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">{hint}</p>}
      {finite && pct >= 80 && pct < 100 && (
        <p className="mt-1 text-[12px] font-semibold text-[var(--color-zap-500)]">
          {pct}% used — upgrade before you run out, so nothing stops mid-campaign.
        </p>
      )}
      {finite && pct >= 100 && (
        <p className="mt-1 text-[12px] font-semibold text-[var(--color-zonk-500)]">
          Used up for this month. Automated sends are paused until the 1st, or until you upgrade.
        </p>
      )}
    </div>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const sp = await searchParams;
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [ws, usage, accounts, subscription, staff, impersonating] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspace.id },
      select: { planKey: true, billingCustomerId: true, planOverride: true, planOverrideUntil: true },
    }),
    getUsage(workspace.id),
    prisma.instagramAccount.count({ where: { workspaceId: workspace.id } }),
    prisma.subscription.findFirst({
      where: { workspaceId: workspace.id, status: { in: ["active", "past_due"] } },
      orderBy: { createdAt: "desc" },
    }),
    getPlatformStaff(),
    isImpersonating(),
  ]);

  // Nothing to buy while billing is off — except for staff, who test the
  // checkout end to end in the provider's test mode before anyone is charged.
  if (!env.billing.enabled && !staff) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Plan & billing" description="Paid plans aren't available yet." />
      </div>
    );
  }

  const plan = planFor(ws.planKey);
  const canCheckout = isBillingConfigured() && !impersonating;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Plan & billing"
        description="Your plan, what you've used this month, and your invoices."
      />

      {!env.billing.enabled && (
        <p className="rounded-xl border-2 border-dashed border-[var(--color-zap-500)] p-3 text-[12.5px] font-semibold text-[var(--text-muted)]">
          Staff preview: paid plans are not switched on for customers yet, and usage limits
          aren&rsquo;t enforced. Checkout works so the flow can be tested end to end.
        </p>
      )}

      {sp.checkout === "done" && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--color-boom-500)] bg-[var(--bg-raised)] p-3 text-[13px] font-semibold">
          {subscription ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-boom-500)]" />
          ) : (
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-zap-500)]" />
          )}
          {subscription
            ? `You're on ${PLANS[subscription.planKey as keyof typeof PLANS]?.name ?? subscription.planKey}. Thank you!`
            : "Payment received. Your plan updates as soon as the payment provider confirms it — usually within a few seconds. Refresh in a moment."}
        </p>
      )}

      {impersonating && (
        <p className="rounded-xl border-2 border-[var(--color-zap-500)] p-3 text-[12.5px] font-semibold text-[var(--text-muted)]">
          Support session: purchases and subscription changes are disabled.
        </p>
      )}

      <SectionCard
        title={`You're on ${plan.name}`}
        description={
          subscription
            ? subscription.cancelAtPeriodEnd
              ? `Cancelled — you keep ${plan.name} until ${subscription.currentPeriodEnd?.toISOString().slice(0, 10) ?? "the end of the period"}, then move to Free.`
              : subscription.status === "past_due"
                ? "Your last payment didn't go through. Update your card to keep your plan — we'll keep retrying for a few days first."
                : `Renews ${subscription.currentPeriodEnd?.toISOString().slice(0, 10) ?? ""} · billed ${subscription.interval === "year" ? "yearly" : "monthly"}`
            : ws.planOverride
              ? ws.planOverrideUntil
                ? `Complimentary until ${ws.planOverrideUntil.toISOString().slice(0, 10)}.`
                : "Complimentary."
              : plan.key === "free"
                ? "Upgrade any time. Your automations carry straight over."
                : undefined
        }
        actions={ws.billingCustomerId && !impersonating ? <ManageSubscriptionButton /> : undefined}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Meter
            label="Automated DMs"
            used={usage.dms}
            cap={plan.limits.dmsPerMonth}
            hint="Resets on the 1st. Replies you type yourself never count."
          />
          <Meter label="AI replies" used={usage.ai_replies} cap={plan.limits.aiRepliesPerMonth} />
          <Meter label="Instagram accounts" used={accounts} cap={plan.limits.instagramAccounts} />
        </div>
      </SectionCard>

      {/* A comped or grandfathered workspace is on Unlimited, which beats every
          card — offering it "Upgrade to Pro" would be selling a downgrade. */}
      {plan.key !== "unlimited" && (
        <PlanCards mode="dashboard" currentPlan={plan.key} canCheckout={canCheckout} />
      )}
    </div>
  );
}
