import { prisma } from "@/lib/db";
import { isPlanKey, type PlanKey } from "./plans";

/**
 * Which plan a workspace is on. See docs/BILLING.md §How a workspace's plan is
 * decided.
 *
 * `resolvePlanKey` is pure — no I/O, clock passed in — so every branch is
 * testable. `recomputeWorkspacePlan` is the only thing that writes the result,
 * and it is called by the webhook, by every admin override change, and by the
 * reconcile job that catches transitions driven by the clock alone.
 */

const RANK: Record<PlanKey, number> = { free: 0, pro: 1, business: 2, unlimited: 3 };

function higher(a: PlanKey, b: PlanKey): PlanKey {
  return RANK[a] >= RANK[b] ? a : b;
}

export type SubscriptionState = {
  planKey: string;
  /** Dodo's status, verbatim. */
  status: string;
  currentPeriodEnd: Date | null;
};

export type OverrideState = {
  plan: string | null;
  until: Date | null;
};

/** What one subscription grants right now. */
export function planFromSubscription(sub: SubscriptionState, _now: Date): PlanKey {
  if (!isPlanKey(sub.planKey)) return "free";
  switch (sub.status) {
    case "active":
    // past_due is Dodo's dunning grace window: the card failed and Dodo is
    // retrying. Degrading here would punish a customer for a bank's hiccup.
    // Dodo moves the subscription to on_hold when the window is exhausted.
    case "past_due":
      return sub.planKey;
    // NOT "cancelled". In Dodo, a customer who cancels to stop renewing stays
    // `active`, with cancel_at_next_billing_date set — the SDK: "the
    // subscription will remain active until the end of billing period". So the
    // paid-through case is already covered above. `cancelled` means access has
    // ended: the period ran out, or it was cancelled immediately, for example
    // with a refund. Granting the plan until next_billing_date there would give
    // a refunded customer the rest of the month for free.
    default:
      // pending, on_hold, paused, failed, expired — or anything Dodo adds later.
      // Unknown states fail closed.
      return "free";
  }
}

/**
 * The resolved plan: the HIGHER of an unexpired override and every
 * subscription. Never "override wins": an override exists to grant (a comp, a
 * grandfathered workspace), and must never be able to take away something a
 * customer is paying for. Restricting a customer is what suspension is for.
 */
export function resolvePlanKey(input: {
  override: OverrideState;
  subscriptions: SubscriptionState[];
  now: Date;
}): PlanKey {
  let plan: PlanKey = "free";

  const { override } = input;
  if (override.plan && isPlanKey(override.plan) && (!override.until || override.until > input.now)) {
    plan = higher(plan, override.plan);
  }
  for (const sub of input.subscriptions) {
    plan = higher(plan, planFromSubscription(sub, input.now));
  }
  return plan;
}

/**
 * Recompute and store a workspace's plan. Returns the before and after so
 * callers can record a change in the payment trace.
 */
export async function recomputeWorkspacePlan(
  workspaceId: string,
  now: Date = new Date(),
): Promise<{ before: string; after: PlanKey } | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      planKey: true,
      planOverride: true,
      planOverrideUntil: true,
      subscriptions: { select: { planKey: true, status: true, currentPeriodEnd: true } },
    },
  });
  if (!workspace) return null;

  const after = resolvePlanKey({
    override: { plan: workspace.planOverride, until: workspace.planOverrideUntil },
    subscriptions: workspace.subscriptions,
    now,
  });

  if (after !== workspace.planKey) {
    await prisma.workspace.update({ where: { id: workspaceId }, data: { planKey: after } });
  }
  return { before: workspace.planKey, after };
}

/**
 * Catch the one transition that happens by the clock alone: an admin override
 * reaching its end date. Run by the maintenance queue every 15 minutes.
 *
 * Subscription changes, including a period ending, arrive as webhooks and are
 * applied there; a missed one is repaired with "Resync from Dodo" in the admin.
 *
 * An expired override is cleared, not just outvoted. Left in place it would
 * match this query on every run, forever.
 */
export async function reconcilePlans(now: Date = new Date()): Promise<number> {
  const expired = await prisma.workspace.findMany({
    where: { planOverride: { not: null }, planOverrideUntil: { lte: now } },
    select: { id: true },
  });

  let changed = 0;
  for (const { id } of expired) {
    await prisma.workspace.update({
      where: { id },
      data: { planOverride: null, planOverrideReason: null, planOverrideUntil: null, planOverrideById: null },
    });
    const result = await recomputeWorkspacePlan(id, now);
    if (result && result.before !== result.after) changed++;
  }
  return changed;
}
