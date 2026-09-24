import { prisma } from "@/lib/db";
import { getLimits } from "@/lib/plan";
import { PLANS, planFor } from "@/lib/billing/plans";
import { emailWorkspaceOwner, humanDate } from "./send";

/**
 * Which events send which email. See docs/EMAIL.md for the full list.
 *
 * Every send carries a dedupe key, so the events that repeat — a webhook Dodo
 * retries, a subscription.updated that changes nothing, a daily job that runs
 * twice — still produce one email. Keys are scoped to the billing period where
 * it matters, so the same situation next month does send again.
 */

const planName = (key: string) => planFor(key).name;
const period = (d: Date | null | undefined) => d?.toISOString() ?? "none";

// --- Subscriptions ----------------------------------------------------------

export type SubscriptionSnapshot = {
  status: string;
  planKey: string;
  interval: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
};

/**
 * Email the change a subscription event made, judged by comparing before and
 * after rather than by event type: Dodo sends several events for one change,
 * and a `subscription.updated` that alters nothing must stay silent.
 */
export async function notifySubscriptionChange(
  workspaceId: string,
  subscriptionId: string,
  before: SubscriptionSnapshot | null,
  after: SubscriptionSnapshot,
  eventAt: Date,
): Promise<void> {
  const plan = planName(after.planKey);
  const end = humanDate(after.currentPeriodEnd);
  const key = (kind: string, extra = period(after.currentPeriodEnd)) => `sub:${subscriptionId}:${kind}:${extra}`;
  const was = before?.status ?? null;

  const lapsed = ["cancelled", "expired", "failed"];

  if (after.status === "active") {
    if (was === "past_due" || was === "on_hold") {
      await emailWorkspaceOwner(workspaceId, "subscription_payment_recovered", { plan }, key("recovered"));
      return;
    }
    if (was === null || was === "pending" || lapsed.includes(was)) {
      await emailWorkspaceOwner(
        workspaceId,
        "subscription_activated",
        { plan, interval: after.interval, renewsOn: after.cancelAtPeriodEnd ? null : end },
        key("activated", "once"),
      );
      return;
    }
    if (before && before.planKey !== after.planKey) {
      await emailWorkspaceOwner(
        workspaceId,
        "subscription_plan_changed",
        { from: planName(before.planKey), to: plan },
        key("plan", String(eventAt.getTime())),
      );
    }
    if (before && !before.cancelAtPeriodEnd && after.cancelAtPeriodEnd) {
      await emailWorkspaceOwner(workspaceId, "subscription_cancel_scheduled", { plan, endsOn: end }, key("cancel"));
    }
    return;
  }

  if (after.status === "past_due" && was !== "past_due") {
    await emailWorkspaceOwner(
      workspaceId,
      "subscription_payment_failed",
      { plan, graceEndsOn: humanDate(after.graceEndsAt) },
      key("past_due"),
    );
    return;
  }

  if (after.status === "on_hold" && was !== "on_hold") {
    await emailWorkspaceOwner(workspaceId, "subscription_on_hold", { plan }, key("on_hold"));
    return;
  }

  if (lapsed.includes(after.status) && !lapsed.includes(was ?? "")) {
    // Only for a plan that was actually running; a checkout that never
    // completed ("failed" straight from pending) isn't an ending.
    if (was === null || was === "pending") return;
    await emailWorkspaceOwner(workspaceId, "subscription_ended", { plan }, key("ended", "once"));
  }
}

/**
 * Reminders that are due by the calendar rather than by an event. Run daily.
 * Each looks at a window of a few days, not one day, so a missed run is caught
 * the next day; the dedupe key keeps that from ever sending twice.
 */
export async function sendBillingReminders(now: Date = new Date()): Promise<number> {
  const day = 24 * 60 * 60 * 1000;
  let queued = 0;

  // Yearly renewals get a week's notice — a large, easily forgotten charge, and
  // one several jurisdictions require advance notice of.
  const renewing = await prisma.subscription.findMany({
    where: {
      status: "active",
      interval: "year",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gte: new Date(now.getTime() + 5 * day), lte: new Date(now.getTime() + 8 * day) },
    },
  });
  for (const s of renewing) {
    const r = await emailWorkspaceOwner(
      s.workspaceId,
      "renewal_reminder",
      { plan: planName(s.planKey), renewsOn: humanDate(s.currentPeriodEnd)! },
      `renewal:${s.providerSubscriptionId}:${period(s.currentPeriodEnd)}`,
    );
    if (r.status !== "duplicate") queued++;
  }

  // A cancelled plan gets a last word a few days before it ends.
  const ending = await prisma.subscription.findMany({
    where: {
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { gte: new Date(now.getTime() + 1 * day), lte: new Date(now.getTime() + 4 * day) },
    },
  });
  for (const s of ending) {
    const r = await emailWorkspaceOwner(
      s.workspaceId,
      "plan_ending_reminder",
      { plan: planName(s.planKey), endsOn: humanDate(s.currentPeriodEnd)! },
      `ending:${s.providerSubscriptionId}:${period(s.currentPeriodEnd)}`,
    );
    if (r.status !== "duplicate") queued++;
  }

  return queued;
}

// --- Usage ------------------------------------------------------------------

const THRESHOLDS = [80, 100] as const;

/**
 * Called with the count a reservation just produced. Because the counter moves
 * one at a time and atomically, exactly one reservation lands on each threshold
 * — so this fires once per threshold without querying anything, and the dedupe
 * key covers a release-and-retake that lands on it a second time.
 */
export async function notifyUsageIfCrossed(
  workspace: { id: string; planKey?: string | null },
  metric: "dms" | "ai_replies",
  count: number,
  periodKey: string,
  now: Date = new Date(),
): Promise<void> {
  const limit = getLimits(workspace)[metric === "dms" ? "dmsPerMonth" : "aiRepliesPerMonth"];
  if (!Number.isFinite(limit) || limit <= 0) return;

  const percent = THRESHOLDS.find((t) => count === Math.ceil((limit * t) / 100));
  if (!percent) return;

  const resets = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await emailWorkspaceOwner(
    workspace.id,
    "usage_threshold",
    {
      metric,
      percent,
      used: count,
      limit,
      plan: planFor(workspace.planKey).name,
      resetsOn: humanDate(resets)!,
    },
    `usage:${workspace.id}:${periodKey}:${metric}:${percent}`,
  );
}

// --- Plans granted by staff -------------------------------------------------

export async function notifyPlanGranted(
  workspaceId: string,
  plan: string,
  until: Date | null,
  grantedAt: Date,
): Promise<void> {
  // Granting Free is a no-op for the customer; there's nothing to announce.
  if (plan === "free" || !(plan in PLANS)) return;
  await emailWorkspaceOwner(
    workspaceId,
    "plan_granted",
    { plan: planName(plan), until: humanDate(until) },
    `grant:${workspaceId}:${grantedAt.getTime()}`,
  );
}

// --- Account alerts ---------------------------------------------------------

/**
 * Instagram stopped accepting our token. One email per break: the key is tied
 * to the last successful refresh, which changes when the account is reconnected,
 * so a later break is a new email — but the many sends that fail at once when a
 * token dies are one.
 */
export async function notifyInstagramReconnect(account: {
  id: string;
  workspaceId: string;
  username: string;
  lastRefreshAt: Date | null;
}): Promise<void> {
  await emailWorkspaceOwner(
    account.workspaceId,
    "instagram_reconnect",
    { username: account.username },
    `ig-reconnect:${account.id}:${period(account.lastRefreshAt)}`,
  );
}

export async function notifyInstagramAccessRemoved(
  account: { id: string; workspaceId: string; username: string },
  at: Date = new Date(),
): Promise<void> {
  await emailWorkspaceOwner(
    account.workspaceId,
    "instagram_access_removed",
    { username: account.username },
    `ig-removed:${account.id}:${at.toISOString().slice(0, 10)}`,
  );
}

export async function notifySuspension(
  workspaceId: string,
  suspended: boolean,
  reason: string | null,
  at: Date,
): Promise<void> {
  await emailWorkspaceOwner(
    workspaceId,
    suspended ? "account_suspended" : "account_reinstated",
    (suspended ? { reason: reason ?? "No reason was recorded." } : {}) as never,
    `${suspended ? "suspend" : "reinstate"}:${workspaceId}:${at.getTime()}`,
  );
}
