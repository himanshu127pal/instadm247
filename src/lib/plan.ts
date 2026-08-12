/**
 * Plan gating seam — DELIBERATELY INERT IN PHASE 1.
 *
 * The owner's instruction is explicit: build every feature ungated first, add
 * pricing in Phase 2. This file is the single place that will change when plans
 * land. No feature code may hardcode a quota — always ask `getLimits()`.
 */

export type Limits = {
  dmsPerMonth: number;
  instagramAccounts: number;
  automations: number;
  flowSteps: number;
  leadCaptures: number;
  broadcastsPerMonth: number;
  aiRepliesPerMonth: number;
  teamSeats: number;
};

const UNLIMITED: Limits = {
  dmsPerMonth: Infinity,
  instagramAccounts: Infinity,
  automations: Infinity,
  // Mirrors LinkDM's published maximum of 8 custom DMs after the starter DM.
  // This is a product/API constraint, not a paywall.
  flowSteps: 8,
  leadCaptures: Infinity,
  broadcastsPerMonth: Infinity,
  aiRepliesPerMonth: Infinity,
  teamSeats: Infinity,
};

export function getLimits(_workspace?: { planKey?: string } | null): Limits {
  return UNLIMITED;
}

/** Always true in Phase 1. Kept so call sites read correctly once plans exist. */
export function isWithinLimit(
  _workspace: { planKey?: string } | null,
  _limit: keyof Limits,
  _current: number,
): boolean {
  return true;
}
