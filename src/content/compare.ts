/**
 * Comparison pages (/compare/[slug]).
 *
 * The rule for every row: a competitor gets a ✓ only for a capability on their
 * own published feature list (docs/FEATURES.md §A, §B, §B2, or their site for
 * ManyChat). Anything they don't list is shown as "Not listed" — never ✗,
 * because not advertising something isn't proof they lack it. And every page
 * says plainly where they're ahead. A comparison that isn't fair is a
 * liability, not marketing.
 */

/** true = has it, false = doesn't (only for us, where we know), string = qualified, null = not listed. */
export type Cell = boolean | string | null;

export type Comparison = {
  slug: string;
  name: string;
  site: string;
  /** When the competitor's side was compiled. Show it on the page. */
  asOf: string;
  source: string;
  title: string;
  description: string;
  summary: string;
  theyLead: string[];
  weLead: string[];
  rows: Array<{ feature: string; us: Cell; them: Cell }>;
  /** Their published pricing, if we have it from their own site. */
  theirPricing?: string;
};

export const COMPARISONS: Comparison[] = [
  {
    slug: "linkdm",
    name: "LinkDM",
    site: "https://www.linkdm.com/",
    asOf: "September 2026",
    source: "LinkDM's published feature list on linkdm.com",
    title: "InstaDM247 vs LinkDM",
    description:
      "InstaDM247 vs LinkDM for Instagram DM automation: comment-to-DM, flows, lead capture, safety features and what each does better.",
    summary:
      "LinkDM is an established comment-to-DM tool with a clear set of Instagram features. InstaDM247 covers that list and adds a visual flow builder, AI replies grounded in your own answers, lead forms with Google Sheets, a live inbox and link-in-bio, with every safety feature on the free plan.",
    theyLead: [
      "Automates Facebook comments as well as Instagram. We're Instagram-only for now.",
      "Has been running comment-to-DM since 2021, per their site.",
    ],
    weLead: [
      "A visual, drag-and-drop flow builder with branching, delays and live validation against Instagram's rules.",
      "AI replies that answer from your knowledge base and hand off when they don't know.",
      "Lead forms, surveys and quizzes, sent to Google Sheets, Kit or Flodesk.",
      "A live inbox with human takeover, and a Safety Center that shows every skipped message and why.",
    ],
    rows: [
      { feature: "Post & Reel comment-to-DM", us: true, them: true },
      { feature: "Facebook comment automation", us: false, them: true },
      { feature: "Story reply automation", us: true, them: true },
      { feature: "Story mention automation", us: true, them: true },
      { feature: "Story emoji reactions, separately from replies", us: true, them: null },
      { feature: "Ad & boosted-post comments", us: true, them: true },
      { feature: "Inbox (DM keyword) automation", us: true, them: true },
      { feature: "Conversation starters", us: true, them: true },
      { feature: "Public comment reply", us: true, them: true },
      { feature: "Flow automation with reminders", us: true, them: true },
      { feature: "Visual drag-and-drop flow builder", us: true, them: null },
      { feature: "Email capture in the DM", us: true, them: true },
      { feature: "Lead forms, surveys & quizzes", us: true, them: null },
      { feature: "Google Sheets", us: true, them: null },
      { feature: "Kit & Flodesk", us: true, them: true },
      { feature: "AI replies from your knowledge base", us: true, them: null },
      { feature: "Rewind (back-send to missed comments)", us: true, them: true },
      { feature: "DM Planner & next post", us: true, them: true },
      { feature: "DM templates & coupons", us: true, them: true },
      { feature: "Link click analytics", us: true, them: true },
      { feature: "Link-in-bio page", us: true, them: null },
      { feature: "Slow Down mode", us: "All plans", them: true },
      { feature: "Live inbox with human takeover", us: true, them: null },
      { feature: "White label (remove branding)", us: "Paid plans", them: true },
      { feature: "Instagram accounts", us: "Up to 10", them: "Up to 10" },
    ],
  },
  {
    slug: "senddm",
    name: "SendDM",
    site: "https://senddm.ai/",
    asOf: "September 2026",
    source: "SendDM's published pricing page on senddm.ai",
    title: "InstaDM247 vs SendDM",
    description:
      "InstaDM247 vs SendDM for Instagram DM automation: stories, AI, link in bio, scheduling, safety features and where each one is ahead.",
    summary:
      "SendDM bundles DM automation with scheduling and link-in-bio. InstaDM247 covers that list too, and adds a visual flow builder, lead forms with Google Sheets, a live inbox with human takeover and a Safety Center, with safety features free on every plan.",
    theyLead: [
      "Their plans go up to 20 Instagram accounts; our Business plan connects 10.",
      "They advertise an unlimited DM send limit; ours are metered per plan.",
      "They offer priority support, a dedicated account manager and an SLA on higher tiers.",
    ],
    weLead: [
      "A visual flow builder with branching, delays and follow-ups that respect the 24-hour window.",
      "Lead forms, surveys and quizzes, sent to Google Sheets, Kit or Flodesk.",
      "Follow-to-unlock that skips people who already follow you.",
      "A live inbox with human takeover, and a Safety Center explaining every skipped message.",
    ],
    rows: [
      { feature: "Comment auto-reply", us: true, them: true },
      { feature: "Story automation", us: true, them: true },
      { feature: "Story mention auto-reply", us: true, them: true },
      { feature: "Advanced keyword triggers", us: true, them: true },
      { feature: "Message templates", us: true, them: true },
      { feature: "AI replies", us: true, them: true },
      { feature: "Viral post protection", us: "All plans", them: true },
      { feature: "Analytics dashboard", us: true, them: true },
      { feature: "Contacts & export", us: "CSV + Excel", them: true },
      { feature: "WhatsApp / email redirect buttons", us: true, them: true },
      { feature: "Conversation starters", us: true, them: true },
      { feature: "DM main menu", us: true, them: true },
      { feature: "Schedule & auto-post", us: true, them: true },
      { feature: "Link-in-bio page with analytics", us: true, them: true },
      { feature: "API access & integrations", us: true, them: true },
      { feature: "Visual drag-and-drop flow builder", us: true, them: null },
      { feature: "Follow-to-unlock gate", us: true, them: null },
      { feature: "Lead forms, surveys & quizzes", us: true, them: null },
      { feature: "Google Sheets", us: true, them: null },
      { feature: "Live inbox with human takeover", us: true, them: null },
      { feature: "Instagram accounts", us: "Up to 10", them: "Up to 20" },
    ],
  },
  {
    slug: "reachlee",
    name: "Reachlee",
    site: "https://www.reachlee.co/",
    asOf: "September 2026",
    source: "Reachlee's site and blog as indexed by search engines",
    title: "InstaDM247 vs Reachlee",
    description:
      "InstaDM247 vs Reachlee for Instagram DM automation: growth gates, lead capture, Google Sheets, follow-ups, pricing and what each does better.",
    summary:
      "Reachlee focuses on growth: comment-to-DM, follow gates, email capture to Google Sheets and follow-up nudges. InstaDM247 does all of that, and adds a visual flow builder, lead forms and quizzes, a Safety Center and link-in-bio.",
    theyLead: [
      "Lower list prices: Free for the first 1,000 DMs, Pro at $9/month and Business at $29/month, per their site.",
    ],
    weLead: [
      "A visual flow builder with branching, not just fixed rules.",
      "Lead forms, surveys and quizzes, not only email capture.",
      "A Safety Center that shows every skipped message and why, and safety features on every plan.",
      "Link-in-bio with click tracking, and a content scheduler.",
    ],
    rows: [
      { feature: "Comment & keyword → DM", us: true, them: true },
      { feature: "Story reply & reaction automation", us: true, them: true },
      { feature: "Follow-to-unlock gate", us: true, them: true },
      { feature: "Email capture in the DM", us: true, them: true },
      { feature: "Google Sheets", us: true, them: true },
      { feature: "Tracked links", us: true, them: true },
      { feature: "Scheduled messages", us: true, them: true },
      { feature: "Multi-account inbox with sound alerts", us: true, them: true },
      { feature: "Follow-up nudges", us: true, them: true },
      { feature: "Re-run on past comments", us: true, them: true },
      { feature: "AI replies", us: true, them: true },
      { feature: "Visual drag-and-drop flow builder", us: true, them: null },
      { feature: "Lead forms, surveys & quizzes", us: true, them: null },
      { feature: "Safety Center", us: true, them: null },
      { feature: "Link-in-bio page", us: true, them: null },
      { feature: "Content scheduler", us: true, them: null },
    ],
    theirPricing: "Free (first 1,000 DMs), Pro $9/month, Business $29/month (from their site, September 2026).",
  },
  {
    slug: "manychat",
    name: "ManyChat",
    site: "https://manychat.com/",
    asOf: "September 2026",
    source: "manychat.com and the ManyChat help center",
    title: "InstaDM247 vs ManyChat for Instagram",
    description:
      "InstaDM247 vs ManyChat for Instagram DM automation: channels, flow builders, AI, safety features and when each is the better choice.",
    summary:
      "ManyChat is a multi-channel chat marketing platform. If you need Messenger, WhatsApp, Telegram, SMS and email in one tool, it's built for that. If Instagram is where your audience is, InstaDM247 is built only for it, with Instagram's rules enforced on every message and every safety feature on the free plan.",
    theyLead: [
      "Many channels: Instagram, Facebook Messenger, WhatsApp, Telegram, TikTok, SMS and email.",
      "A mature visual Flow Builder, with an AI assistant for building flows.",
      "A large integrations ecosystem.",
    ],
    weLead: [
      "Built only for Instagram, with its rules (the 24-hour window, one private reply per comment, rate limits) checked on every message.",
      "Rewind: back-send to comments that arrived before the automation was switched on.",
      "Slow Down mode and viral-post protection, plus a Safety Center that explains every skipped message.",
      "Link-in-bio, DM Planner and a content scheduler in the same tool.",
    ],
    rows: [
      { feature: "Instagram comment-to-DM", us: true, them: true },
      { feature: "Instagram story automation", us: true, them: true },
      { feature: "Visual flow builder", us: true, them: true },
      { feature: "AI replies", us: true, them: true },
      { feature: "Broadcasts", us: true, them: true },
      { feature: "Google Sheets", us: true, them: true },
      { feature: "Facebook Messenger, WhatsApp, Telegram, SMS, email", us: false, them: true },
      { feature: "Rewind (back-send to missed comments)", us: true, them: null },
      { feature: "Slow Down & viral-post protection", us: "All plans", them: null },
      { feature: "Safety Center (every skipped message explained)", us: true, them: null },
      { feature: "Link-in-bio page", us: true, them: null },
      { feature: "Content scheduler", us: true, them: null },
    ],
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
