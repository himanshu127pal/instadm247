/**
 * Feature pages (/features/[slug]). Every claim here must be true of the
 * product as built — these pages are the public version of docs/FEATURES.md.
 * If a feature changes, change its page in the same PR.
 */

export type FeaturePage = {
  slug: string;
  /** Short name for menus and cards. */
  name: string;
  /** <title> and the H1's plain-text equivalent. */
  title: string;
  /** Meta description: what it is and who it's for, under ~155 characters. */
  description: string;
  eyebrow: string;
  headline: string;
  intro: string;
  steps: Array<{ title: string; body: string }>;
  highlights: Array<{ title: string; body: string }>;
  faqs: Array<{ question: string; answer: string }>;
  related: string[];
};

export const FEATURES: FeaturePage[] = [
  {
    slug: "comment-to-dm",
    name: "Comment to DM",
    title: "Instagram comment-to-DM automation",
    description:
      "Send a DM to everyone who comments a keyword on your posts, Reels, ads or Lives — automatically, within Instagram's rules.",
    eyebrow: "Comment to DM",
    headline: "Someone comments your keyword. The link is in their DMs seconds later.",
    intro:
      "Comment-to-DM turns \"comment LINK and I'll send it\" into something you set up once. Pick the posts, pick the keyword, write the message — every matching comment gets a private reply in their inbox, and a public reply under their comment so the thread keeps moving.",
    steps: [
      { title: "Choose where it listens", body: "A specific post or Reel, all your posts, everything including future posts, or only ads and boosted posts." },
      { title: "Set the keyword", body: "Match words anywhere in the comment, exactly, or at the start — with typo tolerance, negative keywords and optional regular expressions." },
      { title: "Write the DM", body: "Text, a button link, an image or a carousel of up to 10 cards. Add a public comment reply that rotates between a few phrasings." },
    ],
    highlights: [
      { title: "One private reply per comment", body: "Instagram allows a single private reply to each comment, within 7 days. We enforce it, so a redelivered webhook can never send a second one." },
      { title: "Rewind", body: "Turned an automation on after the comments started? Rewind back-sends to the comments that are still eligible." },
      { title: "Ads and Lives", body: "Comments on boosted posts and ads, and comments during an Instagram Live, can trigger their own automations." },
      { title: "Tracked links", body: "Every link in a DM is tracked, so you can see which post actually drives clicks." },
    ],
    faqs: [
      { question: "How fast does the DM arrive?", answer: "Usually within a couple of seconds of the comment. Instagram notifies us the moment it happens and the reply is sent immediately." },
      { question: "Can I reply to comments on Reels?", answer: "Yes. Reels are posts as far as Instagram's API is concerned, so every comment-to-DM option works on them." },
      { question: "What if the same person comments twice?", answer: "You decide: send once per person, once per post, every time, or after a cooldown." },
      { question: "Will it reply to old comments?", answer: "Only if you use Rewind, and only to comments Instagram still allows a private reply to — up to 7 days old." },
    ],
    related: ["follow-to-unlock", "lead-capture", "account-safety"],
  },
  {
    slug: "story-automation",
    name: "Story replies & reactions",
    title: "Instagram story reply, reaction and mention automation",
    description:
      "Auto-DM people who reply to your stories, react with an emoji or @mention you — with separate automations for reactions and written replies.",
    eyebrow: "Stories",
    headline: "Every story reply, reaction and mention gets an answer.",
    intro:
      "Stories are where your most engaged followers talk back. Story automation answers them in the DM thread they started — a thank-you for a reaction, the link for a reply that says \"LINK\", a reshare prompt for a mention.",
    steps: [
      { title: "Pick the trigger", body: "Story replies (including emoji reactions) or story @mentions." },
      { title: "Choose what counts", body: "Only emoji reactions, only written replies, specific keywords, or everything." },
      { title: "Send the flow", body: "A single DM or a full flow — follow gate, lead form, AI answer, coupon." },
    ],
    highlights: [
      { title: "Reactions and replies, separately", body: "A tap on the reaction bar under your story arrives as a reply containing just the emoji. We tell the two apart, so a 🔥 can get a thank-you and a question can get an answer." },
      { title: "Mentions", body: "When someone @mentions you in their story, you can thank them, send a discount, or ask them to tag a friend." },
      { title: "The window is already open", body: "A story reply or reaction starts a conversation, so your DM goes out inside Instagram's 24-hour messaging window." },
      { title: "Heart likes", body: "Instagram doesn't share story likes (the heart) with apps, so they can't trigger anything — no tool can, whatever it claims." },
    ],
    faqs: [
      { question: "Can I automate replies to story reactions?", answer: "Yes. Choose \"Emoji reactions only\" on a story automation. Quick reactions arrive as story replies made of just the emoji, and that's what it matches." },
      { question: "Do GIF or sticker replies trigger it?", answer: "No — Instagram doesn't send those to apps, so there's nothing to react to." },
      { question: "Can I answer story replies with AI?", answer: "Yes. Add an AI reply step to the flow and it answers from your knowledge base." },
    ],
    related: ["dm-keyword-replies", "ai-replies", "comment-to-dm"],
  },
  {
    slug: "dm-keyword-replies",
    name: "DM auto-replies",
    title: "Instagram DM keyword auto-replies and conversation starters",
    description:
      "Answer Instagram DMs automatically by keyword, set up conversation starters and a DM menu, and hand off to a person when it matters.",
    eyebrow: "Inbox automation",
    headline: "Someone DMs \"PRICE\". They get the price. You get your evening back.",
    intro:
      "DM keyword replies answer the questions you get fifty times a week. Conversation starters put tappable questions in front of people before they type, and the DM menu keeps your key links one tap away.",
    steps: [
      { title: "Add keywords", body: "PRICE, SHIPPING, COLLAB — with typo tolerance, negative keywords, exact or regex matching." },
      { title: "Write the answer", body: "Text, buttons, images, carousels, quick replies — or a whole flow." },
      { title: "Set conversation starters", body: "Up to four tappable questions shown when someone opens a chat with you, each starting its own automation." },
    ],
    highlights: [
      { title: "Follow up if they go quiet", body: "Add a nudge a few hours later that only goes out if they haven't replied — and never after Instagram's 24-hour window closes." },
      { title: "Human takeover", body: "Reply yourself from the Inbox and automation pauses for that one person until you're done." },
      { title: "Opt-outs honoured", body: "Anyone who replies STOP is suppressed from automations immediately." },
      { title: "DM menu", body: "A persistent menu in your DM thread with up to 20 items." },
    ],
    faqs: [
      { question: "Will it reply to every message I get?", answer: "Only if you want it to. Keyword automations fire on the words you choose; an \"everyone\" automation can greet every new conversation." },
      { question: "Can I stop automation for one conversation?", answer: "Yes — take over from the Inbox and it pauses for that person only." },
      { question: "How do follow-ups respect Instagram's rules?", answer: "Every follow-up is sent through the same checks as everything else: if the 24-hour window has closed, it isn't sent." },
    ],
    related: ["live-inbox", "ai-replies", "story-automation"],
  },
  {
    slug: "follow-to-unlock",
    name: "Follow to unlock",
    title: "Instagram follow-to-unlock: grow followers from every DM",
    description:
      "Ask people to follow you before they get the link — and skip the ask for people who already follow. A follower growth gate built on Instagram's API.",
    eyebrow: "Follower growth",
    headline: "Turn \"comment LINK\" into a new follower, not just a click.",
    intro:
      "The follow gate checks whether someone follows you before sending the goods. Followers get the link straight away. Everyone else gets a friendly ask, and we check again a few minutes later.",
    steps: [
      { title: "Check", body: "A Follower check step reads Instagram's own follow status for the person." },
      { title: "Ask", body: "Not following yet? Send a short, friendly ask." },
      { title: "Re-check and deliver", body: "After a wait you choose, we check again. Followers get the link; you decide whether everyone else gets it anyway." },
    ],
    highlights: [
      { title: "No nagging existing fans", body: "People who already follow you never see the ask." },
      { title: "Uses Instagram's own data", body: "Follow status comes from Instagram's User Profile API, not a guess." },
      { title: "Measured", body: "Funnel analytics show how many people were asked, followed, and clicked." },
      { title: "Works everywhere", body: "Comments, story replies, DMs — any trigger can go through the gate." },
    ],
    faqs: [
      { question: "Is follow-gating allowed by Instagram?", answer: "Asking someone to follow is fine; forcing it or spamming isn't. We ask once, check with Instagram's API, and never automate follows." },
      { question: "What if they don't follow?", answer: "You decide: send the link anyway after the ask, or end the flow." },
    ],
    related: ["comment-to-dm", "lead-capture", "account-safety"],
  },
  {
    slug: "lead-capture",
    name: "Lead capture",
    title: "Capture emails and leads in Instagram DMs",
    description:
      "Collect emails, phone numbers and answers inside Instagram DMs with forms, surveys and quizzes — then send them to Google Sheets, Kit or Flodesk.",
    eyebrow: "Lead capture",
    headline: "Get the email in the DM. No landing page, no drop-off.",
    intro:
      "Lead forms ask questions one at a time inside the conversation, validate the answers, and save them to your contacts. Every completed form can go straight to a spreadsheet or your email tool.",
    steps: [
      { title: "Build the form", body: "Email, phone, text, choices — as a form, a survey, a quiz with scores, or an order form." },
      { title: "Drop it in a flow", body: "Ask right after the link, or before it — your call." },
      { title: "Send it on", body: "Google Sheets gets every response as a row; Kit and Flodesk get every email; webhooks get it all." },
    ],
    highlights: [
      { title: "Google Sheets", body: "Connect with Google and each form gets its own tab in a spreadsheet in your Drive. We can only touch that one file." },
      { title: "Kit and Flodesk", body: "Paste an API key and captured emails land in your list or segment." },
      { title: "Tap to answer", body: "Multiple-choice questions become buttons, so answering is one tap." },
      { title: "Export anytime", body: "Download responses as CSV or Excel." },
    ],
    faqs: [
      { question: "Where do the leads go?", answer: "Into your contacts and the form's responses, and optionally Google Sheets, Kit, Flodesk or your own webhook." },
      { question: "Is my Google Drive safe?", answer: "We ask Google only for access to files our app creates, so we can see and edit the leads spreadsheet and nothing else." },
    ],
    related: ["comment-to-dm", "ai-replies", "link-in-bio"],
  },
  {
    slug: "ai-replies",
    name: "AI replies",
    title: "AI replies for Instagram DMs, grounded in your own answers",
    description:
      "An AI agent that answers Instagram DMs from your knowledge base — and hands the conversation to you when it isn't sure, instead of making things up.",
    eyebrow: "AI agent",
    headline: "Answers from your FAQ. Hands off when it doesn't know.",
    intro:
      "Give the AI your FAQ, policies and product details. It answers from that, in your tone, and when a question falls outside what you've told it, it says so and flags the conversation for you.",
    steps: [
      { title: "Teach it", body: "Add knowledge base entries — shipping, sizing, pricing, collaborations." },
      { title: "Set the guardrails", body: "Topics it must not answer, when to hand off, how it should sound." },
      { title: "Use it anywhere", body: "As a step in any flow, or as the reply to every DM." },
    ],
    highlights: [
      { title: "No invented answers", body: "If it isn't in your knowledge base, it doesn't pretend. The conversation moves to your Inbox instead." },
      { title: "Honest handoff", body: "Handed-off conversations are flagged so you can pick them up." },
      { title: "Inside the rules", body: "AI replies go through the same window, rate-limit and opt-out checks as every other message." },
      { title: "Metered clearly", body: "AI replies are counted separately from DMs, so you always know what you've used." },
    ],
    faqs: [
      { question: "Will the AI make up prices or shipping times?", answer: "It's instructed to answer only from your knowledge base, and to hand off when the answer isn't there." },
      { question: "Which plan includes AI replies?", answer: "AI replies are included on the paid plans, with a monthly allowance." },
    ],
    related: ["dm-keyword-replies", "live-inbox", "lead-capture"],
  },
  {
    slug: "link-in-bio",
    name: "Link in bio",
    title: "Free link-in-bio page with click tracking",
    description:
      "A fast link-in-bio page for your Instagram profile, with per-link click tracking, five themes, and product, email and WhatsApp blocks.",
    eyebrow: "Link in bio",
    headline: "One link in your bio. Every tap counted.",
    intro:
      "A hosted page at your own short link, built for a phone and an Instagram profile tap. Add links, headings, products, email and WhatsApp buttons, and see exactly which ones people use.",
    steps: [
      { title: "Pick your link", body: "Choose your address — we check it's free as you type." },
      { title: "Add blocks", body: "Links, headings, text, products, social, email and WhatsApp." },
      { title: "Put it in your bio", body: "Copy the link into your Instagram profile." },
    ],
    highlights: [
      { title: "Click tracking", body: "Views and taps per block, with full history." },
      { title: "Five themes", body: "Comic cream, midnight, punch, mint and sky." },
      { title: "Fast", body: "No dashboard code, no tracking scripts — it loads quickly on a phone." },
      { title: "Your brand", body: "Paid plans can remove the \"Made with InstaDM247\" badge." },
    ],
    faqs: [
      { question: "Is link in bio free?", answer: "Yes, on every plan. The Free plan shows a small \"Made with InstaDM247\" badge." },
      { question: "Can I have more than one page?", answer: "Yes — one per account, campaign or brand." },
    ],
    related: ["lead-capture", "comment-to-dm", "broadcasts"],
  },
  {
    slug: "broadcasts",
    name: "Broadcasts",
    title: "Instagram DM broadcasts and re-engagement, inside the rules",
    description:
      "Message everyone whose 24-hour window is still open, schedule broadcasts, and nudge contacts who've gone quiet — with the eligible count shown up front.",
    eyebrow: "Broadcasts",
    headline: "Message your audience — the ones Instagram lets you reach.",
    intro:
      "Instagram only lets you message someone within 24 hours of them interacting with you. Broadcasts work with that rule: you see how many people are reachable before you send, and nobody outside the window is messaged.",
    steps: [
      { title: "Pick the audience", body: "Everyone reachable, or a segment by tag, custom field or activity." },
      { title: "Write and schedule", body: "Send now or at a set time." },
      { title: "See the result", body: "Delivered, skipped and why, per person." },
    ],
    highlights: [
      { title: "Eligibility preview", body: "The reachable count, before you press send." },
      { title: "Smart re-engagement", body: "A recurring nudge for contacts who've gone quiet, while they're still reachable." },
      { title: "Throttled", body: "Broadcasts go out under our conservative rate limits, never in a burst." },
      { title: "Opt-outs respected", body: "Anyone who opted out is skipped automatically." },
    ],
    faqs: [
      { question: "Why can't I message all my followers?", answer: "Instagram doesn't allow it. Messages are only allowed within 24 hours of someone's last interaction, and any tool that claims otherwise is breaking the rules." },
      { question: "Which plan includes broadcasts?", answer: "Broadcasts are part of the paid plans." },
    ],
    related: ["account-safety", "dm-keyword-replies", "live-inbox"],
  },
  {
    slug: "live-inbox",
    name: "Live inbox",
    title: "A live Instagram DM inbox with human takeover and alerts",
    description:
      "Every conversation across your Instagram accounts in one live inbox — with sound and desktop alerts, and automation that steps aside when you reply.",
    eyebrow: "Inbox",
    headline: "One inbox for every account. Automation steps aside when you step in.",
    intro:
      "Conversations from all your connected accounts land in one place and update on their own. Reply yourself and automation pauses for that person; hand it back when you're done.",
    steps: [
      { title: "See everything", body: "Every thread, with the 24-hour window countdown for each." },
      { title: "Get alerted", body: "A chime and, if you like, a desktop notification when someone new writes." },
      { title: "Take over", body: "Reply and automation pauses for that conversation only." },
    ],
    highlights: [
      { title: "Human replies are never metered", body: "Messages you type yourself don't count toward any plan limit, and are never blocked by one." },
      { title: "7-day human reply window", body: "Replies you type can use Instagram's human agent tag, which extends the window to 7 days. Automations never use it." },
      { title: "Multi-account", body: "Every connected account in one list, each thread labelled with the account it came to." },
      { title: "Context", body: "Tags and follower status alongside the thread." },
    ],
    faqs: [
      { question: "Do I get notified of new messages?", answer: "Yes — turn on sound and desktop alerts in the Inbox. They only fire for messages people send you, never for your own automations." },
    ],
    related: ["dm-keyword-replies", "ai-replies", "account-safety"],
  },
  {
    slug: "account-safety",
    name: "Account safety",
    title: "Instagram DM automation that won't get your account restricted",
    description:
      "Built only on Meta's official API, with the 24-hour window, private-reply limits, rate limits and viral-post protection enforced on every message — free on every plan.",
    eyebrow: "Account safety",
    headline: "Automation that plays by Instagram's rules — every message, every plan.",
    intro:
      "Accounts get restricted when tools scrape, fake human activity or blast messages. InstaDM247 does none of that: every message goes through one dispatcher that checks Instagram's rules before it leaves, and every safety feature is included on the Free plan.",
    steps: [
      { title: "Official API only", body: "Everything runs through Meta's Instagram API with permissions you approve on Instagram's own screen. No passwords, no scraping." },
      { title: "Checked before sending", body: "The messaging window, one private reply per comment, opt-outs and rate limits are checked for every single message." },
      { title: "Slowed when it spikes", body: "Slow Down mode and viral-post protection pace replies when a Reel takes off." },
    ],
    highlights: [
      { title: "Safety Center", body: "Every skipped message, with the reason in plain language." },
      { title: "Conservative limits", body: "Our default send rate sits well under Meta's published limits." },
      { title: "Human tag used honestly", body: "The human agent tag is only ever attached to replies a person typed." },
      { title: "Never a paid extra", body: "Safety features are on every plan, free included." },
    ],
    faqs: [
      { question: "Can this get my account banned?", answer: "Not from anything we do. We only use Meta's official API, within its rules, and refuse to send anything that would break them." },
      { question: "Do you need my Instagram password?", answer: "No. You connect through Instagram's own login screen and can revoke access at any time." },
      { question: "What is the 24-hour window?", answer: "Instagram only allows a business to message someone within 24 hours of that person's last message or interaction. Comments have a separate 7-day window for one private reply." },
    ],
    related: ["broadcasts", "comment-to-dm", "live-inbox"],
  },
];

export function getFeature(slug: string): FeaturePage | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
