import { env } from "@/lib/env";
import {
  FEATURE_LABELS,
  NODE_FEATURE,
  PLANS,
  cheapestPlanWith,
  planFor,
  type Feature,
  type Limits,
  type Plan,
} from "@/lib/billing/plans";

/**
 * The plan seam — the ONE place that decides what a workspace may do.
 *
 * Every gated action asks here. Nothing in feature code hardcodes a limit or
 * reads `planKey` to make a decision. See docs/BILLING.md.
 *
 * `BILLING_ENABLED` is applied at read time rather than stored: while it is off,
 * every workspace is treated as unlimited, but `planKey` still resolves normally
 * so the admin panel shows what each workspace would be on.
 */

export type { Feature, Limits };

type PlanHolder = { planKey?: string | null } | null | undefined;

/** The plan in force right now, after the billing flag. */
export function effectivePlan(workspace: PlanHolder): Plan {
  if (!env.billing.enabled) return PLANS.unlimited;
  return planFor(workspace?.planKey);
}

export function getLimits(workspace: PlanHolder): Limits {
  return effectivePlan(workspace).limits;
}

export function hasFeature(workspace: PlanHolder, feature: Feature): boolean {
  return effectivePlan(workspace).features.has(feature);
}

/** True when `current` is still below the limit — i.e. one more is allowed. */
export function isWithinLimit(
  workspace: PlanHolder,
  limit: keyof Limits,
  current: number,
): boolean {
  return current < getLimits(workspace)[limit];
}

/** The feature a flow node needs, or null if the node is core. */
export function featureForNode(nodeType: string): Feature | null {
  return NODE_FEATURE[nodeType] ?? null;
}

/**
 * Thrown by API routes when a plan does not cover the request. `route()` turns
 * it into a 402 with a message the dashboard shows as-is, so it must be written
 * for the customer.
 */
export class PlanLimitError extends Error {
  readonly status = 402;
  constructor(
    message: string,
    readonly upgradeTo: "pro" | "business",
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export function requireFeature(workspace: PlanHolder, feature: Feature): void {
  if (hasFeature(workspace, feature)) return;
  const upgradeTo = cheapestPlanWith(feature);
  throw new PlanLimitError(
    `${FEATURE_LABELS[feature]} is part of the ${PLANS[upgradeTo].name} plan. Upgrade to use it.`,
    upgradeTo,
  );
}

/** Refuse a flow that uses nodes the plan does not include, naming the first. */
export function requireNodesAllowed(workspace: PlanHolder, nodeTypes: Iterable<string>): void {
  for (const type of nodeTypes) {
    const feature = featureForNode(type);
    if (feature) requireFeature(workspace, feature);
  }
}
