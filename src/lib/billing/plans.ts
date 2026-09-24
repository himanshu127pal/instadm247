/**
 * The price list. Every plan, limit and gated feature is defined here and
 * nowhere else — see docs/BILLING.md for why each line is where it is.
 *
 * Two things are deliberately absent from every gate:
 *
 *   - Safety. Slow Down, viral protection, the messaging window, rate limits and
 *     per-comment dedupe run on every plan. They are hard rules in dispatch.ts;
 *     putting them behind a paywall would mean weakening the dispatcher, and the
 *     product's whole promise is that creators don't get banned.
 *   - Team seats. Inviting a second member is not built, so there is nothing to
 *     sell. Don't add a seat limit until invites exist.
 */

export type PlanKey = "free" | "pro" | "business" | "unlimited";

/** Plans a customer can buy. `unlimited` is internal and never sold. */
export const PURCHASABLE_PLANS = ["pro", "business"] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export type BillingInterval = "month" | "year";

export type Feature =
  /** DELAY, CONDITION, RANDOMIZER and SET_FIELD nodes. */
  | "advancedFlows"
  /** Lead forms and the COLLECT_INPUT node. */
  | "leadCapture"
  /** Coupon pools and the SEND_COUPON node. */
  | "coupons"
  /** The AI_REPLY node and the AI agent settings. Metered separately. */
  | "aiAgent"
  /**
   * The in-dashboard AI Helper: how-to answers about InstaDM247 and draft
   * automations. Metered as `helperQuestionsPerWeek`. See docs/HELPER.md.
   */
  | "aiHelper"
  | "templates"
  | "dmPlanner"
  | "rewind"
  | "broadcasts"
  | "scheduler"
  /** Kit and Flodesk. */
  | "integrations"
  /** Public API keys, outbound webhooks, and the HTTP_REQUEST node. */
  | "apiAccess"
  /**
   * No InstaDM247 branding: the Link-in-Bio badge becomes optional and
   * automated DMs go out without the "Sent with InstaDM247" line. Checked when
   * a page renders or a DM is sent, never stored — so it switches off on
   * upgrade and back on when a paid plan ends. See src/lib/branding.ts.
   */
  | "removeBranding";

export type Limits = {
  instagramAccounts: number;
  /** Automated DMs — flows, AI, broadcasts. Human Inbox replies never count. */
  dmsPerMonth: number;
  aiRepliesPerMonth: number;
  /**
   * Questions to the AI Helper, per week (Monday 00:00 UTC). Each one is a paid
   * model call, so it's capped — weekly, so running out means days, not weeks.
   */
  helperQuestionsPerWeek: number;
  /**
   * Custom DMs after the starter DM. A product constraint mirroring LinkDM's
   * published maximum, the same on every plan — not a paywall.
   */
  flowSteps: number;
};

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  /** USD, whole dollars. Null for plans that are not sold. */
  price: { month: number; year: number } | null;
  limits: Limits;
  features: ReadonlySet<Feature>;
};

const ALL_FEATURES: Feature[] = [
  "advancedFlows",
  "leadCapture",
  "coupons",
  "aiAgent",
  "aiHelper",
  "templates",
  "dmPlanner",
  "rewind",
  "broadcasts",
  "scheduler",
  "integrations",
  "apiAccess",
  "removeBranding",
];

const FLOW_STEPS = 8;

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Free",
    tagline: "Everything you need to start automating one account.",
    price: { month: 0, year: 0 },
    limits: {
      instagramAccounts: 1,
      dmsPerMonth: 1_000,
      aiRepliesPerMonth: 0,
      helperQuestionsPerWeek: 5,
      flowSteps: FLOW_STEPS,
    },
    // The helper is how a new account gets its first automation working, so
    // Free gets a taste of it; the weekly cap keeps its cost small.
    features: new Set<Feature>(["aiHelper"]),
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "For creators growing fast across a few accounts.",
    // Annual is two months free. The provider's fixed per-transaction fee makes
    // small monthly charges expensive to collect, so annual is worth pushing.
    price: { month: 19, year: 190 },
    limits: {
      instagramAccounts: 3,
      dmsPerMonth: 25_000,
      aiRepliesPerMonth: 1_000,
      helperQuestionsPerWeek: 20,
      flowSteps: FLOW_STEPS,
    },
    features: new Set<Feature>(ALL_FEATURES.filter((f) => f !== "apiAccess")),
  },
  business: {
    key: "business",
    name: "Business",
    tagline: "For brands and teams running automation at volume.",
    price: { month: 79, year: 790 },
    limits: {
      instagramAccounts: 10,
      dmsPerMonth: 300_000,
      aiRepliesPerMonth: 10_000,
      helperQuestionsPerWeek: 50,
      flowSteps: FLOW_STEPS,
    },
    features: new Set<Feature>(ALL_FEATURES),
  },
  unlimited: {
    key: "unlimited",
    name: "Unlimited",
    tagline: "Internal: staff, comps, and workspaces that predate billing.",
    price: null,
    limits: {
      instagramAccounts: Infinity,
      dmsPerMonth: Infinity,
      aiRepliesPerMonth: Infinity,
      helperQuestionsPerWeek: Infinity,
      flowSteps: FLOW_STEPS,
    },
    features: new Set<Feature>(ALL_FEATURES),
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && value in PLANS;
}

/** Unknown keys resolve to Free: failing closed on a typo is the safe side. */
export function planFor(key: string | null | undefined): Plan {
  return isPlanKey(key) ? PLANS[key] : PLANS.free;
}

/** The cheapest purchasable plan that includes a feature — for upgrade prompts. */
export function cheapestPlanWith(feature: Feature): PurchasablePlan {
  return PLANS.pro.features.has(feature) ? "pro" : "business";
}

/** Human-readable names, used in upgrade messages and the pricing page. */
export const FEATURE_LABELS: Record<Feature, string> = {
  advancedFlows: "Advanced flows (delays, conditions, randomizer, custom fields)",
  leadCapture: "Lead capture",
  coupons: "DM coupons",
  aiAgent: "AI agent",
  aiHelper: "AI Helper",
  templates: "DM templates",
  dmPlanner: "DM Planner",
  rewind: "Rewind",
  broadcasts: "Broadcasts",
  scheduler: "Post scheduler",
  integrations: "Kit & Flodesk integrations",
  apiAccess: "Public API & outbound webhooks",
  removeBranding: "No InstaDM247 branding",
};

/**
 * Which feature, if any, a flow node needs. Nodes not listed are core and run on
 * every plan. HUMAN_HANDOFF is deliberately core: letting a person take over a
 * conversation is closer to safety than to a premium feature.
 */
export const NODE_FEATURE: Partial<Record<string, Feature>> = {
  DELAY: "advancedFlows",
  CONDITION: "advancedFlows",
  RANDOMIZER: "advancedFlows",
  SET_FIELD: "advancedFlows",
  COLLECT_INPUT: "leadCapture",
  SEND_COUPON: "coupons",
  AI_REPLY: "aiAgent",
  HTTP_REQUEST: "apiAccess",
};
