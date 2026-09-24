/**
 * Blog posts (/blog/[slug]). Written as data rather than MDX: no new build
 * dependency, and every post renders through the same components.
 *
 * Inline text supports **bold** and [links](/path) — see renderInline in
 * src/components/marketing/content.tsx. Keep posts genuinely useful and
 * accurate; they describe Instagram's rules as our dispatcher enforces them.
 */

export type Block =
  | { h2: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { callout: { title: string; body: string } };

export type Post = {
  slug: string;
  title: string;
  description: string;
  /** ISO date. */
  published: string;
  updated?: string;
  readingMinutes: number;
  tags: string[];
  body: Block[];
};

export const POSTS: Post[] = [
  {
    slug: "instagram-24-hour-messaging-window",
    title: "Instagram's 24-hour messaging window, explained",
    description:
      "When a business can message someone on Instagram, why comments are different, what the 7-day human agent tag is for — and how to automate inside the rules.",
    published: "2026-09-24",
    readingMinutes: 5,
    tags: ["Instagram rules", "Guides"],
    body: [
      { p: "Every Instagram DM tool lives inside one rule: a business can only message someone for **24 hours after that person last interacted with it**. Understand the window and most of what automation can and can't do falls into place." },
      { h2: "What opens the window" },
      { p: "The window opens — or reopens — when the person does something that starts a conversation with you:" },
      { ul: [
        "They send you a DM.",
        "They reply to or react to one of your stories.",
        "They @mention you in their story.",
        "They tap a conversation starter or a button in one of your messages.",
      ] },
      { p: "From that moment you have 24 hours to reply, as many times as the conversation needs. When they write again, the clock starts over." },
      { h2: "Comments are different" },
      { p: "A comment on a post or Reel doesn't open the 24-hour window. Instead, Instagram allows **one private reply per comment**, sent as a DM, within **7 days** of the comment. That single message is what comment-to-DM tools send." },
      { p: "If the person replies to that DM, the normal 24-hour window opens and the conversation can continue. If they don't, that one private reply is all you get — which is why a good first message matters." },
      { callout: { title: "Live comments", body: "Comments on an Instagram Live can be answered with a private reply only while the broadcast is running." } },
      { h2: "The 7-day human agent tag" },
      { p: "Instagram offers a **human agent** tag that lets a business reply for up to 7 days after the person's last message. It exists for one purpose: a real person answering a question that took longer than a day to resolve." },
      { p: "It must only be used on messages a human actually typed. Attaching it to automated messages to stretch the window is exactly the kind of thing Meta watches for. In InstaDM247 the tag is only ever added to replies you type in the Inbox; automations can't use it." },
      { h2: "What this means for automation" },
      { ul: [
        "**Broadcasts** can only reach people whose window is still open. A tool that claims to message \"all your followers\" is breaking the rules.",
        "**Follow-ups** have to land inside the window. A nudge 4 hours later works; a nudge 2 days later doesn't.",
        "**Comment-to-DM** gets one shot per comment. Make it count: the link, and a reason to reply.",
      ] },
      { p: "InstaDM247 checks the window for every message before it's sent. If a follow-up would land after the window closes, it's skipped and the reason shows up in the [Safety Center](/features/account-safety) — it's never sent anyway." },
      { h2: "Quick reference" },
      { ul: [
        "DM, story reply, story reaction, story mention → 24 hours to reply.",
        "Comment → one private reply, within 7 days.",
        "Live comment → one private reply, during the broadcast.",
        "A reply typed by a person → up to 7 days with the human agent tag.",
      ] },
    ],
  },
  {
    slug: "how-to-set-up-comment-to-dm",
    title: "How to set up comment-to-DM on Instagram (step by step)",
    description:
      "Send your link to everyone who comments a keyword: choosing the keyword, writing a DM people reply to, public replies, and the settings that matter.",
    published: "2026-09-24",
    readingMinutes: 6,
    tags: ["Guides", "Comment to DM"],
    body: [
      { p: "\"Comment LINK and I'll send it to you\" is the most reliable way to turn a post into clicks. Here's how to set it up so it works — and so people actually open the DM." },
      { h2: "1. Connect a professional account" },
      { p: "Comment-to-DM needs an Instagram **Business or Creator** account. Both are free to switch to in Instagram's settings. With InstaDM247 you connect through Instagram's own login screen; you don't need a Facebook Page." },
      { h2: "2. Pick a keyword people will actually type" },
      { ul: [
        "Short and unusual: **LINK**, **GUIDE**, **RECIPE** — not \"yes\" or \"love\", which people write anyway.",
        "Say it in the caption, on screen and in the first comment.",
        "Turn on typo tolerance so \"LIMK\" still counts, and add negative keywords for phrases you don't want to trigger it.",
      ] },
      { h2: "3. Choose which posts it listens to" },
      { p: "Start with a single post or Reel while you test. Once it works, you can widen it to all posts, to everything including future posts, or to ads and boosted posts only." },
      { h2: "4. Write a DM people reply to" },
      { p: "Remember the rule: a comment allows **one** private reply. If the person answers it, a normal conversation opens and you can send more. So the first DM should do two jobs — deliver the link, and give a reason to reply." },
      { ul: [
        "Lead with the link, as a button — it's easier to tap than a URL.",
        "Add one question: \"Want the printable version too?\" A reply opens the conversation.",
        "Keep it personal: use their first name.",
      ] },
      { h2: "5. Reply publicly too" },
      { p: "A public reply under the comment (\"Sent! Check your DMs 📩\") tells everyone else the offer is real, which brings more comments. Rotate a few phrasings so the thread doesn't look robotic." },
      { h2: "6. Decide what happens if they comment twice" },
      { p: "Once per person, once per post, every time, or after a cooldown. Once per post is the sensible default." },
      { h2: "7. Add a follow gate or a lead form (optional)" },
      { p: "Want followers, not just clicks? A [follow-to-unlock](/features/follow-to-unlock) step asks non-followers to follow first and skips the ask for people who already do. Want emails? A [lead form](/features/lead-capture) can ask for one right after the link." },
      { callout: { title: "Already posted and the comments came in?", body: "Rewind back-sends to comments that are still eligible for a private reply — up to 7 days old." } },
      { h2: "8. Test it" },
      { p: "Comment from a second account and check the DM, the public reply and the tracked link click. Then switch it on." },
    ],
  },
  {
    slug: "why-instagram-dm-tools-get-accounts-restricted",
    title: "Why Instagram DM tools get accounts restricted — and how to avoid it",
    description:
      "Scraping, fake human activity, messaging outside the window, bursts of identical DMs: what actually gets accounts restricted, and what a safe tool does instead.",
    published: "2026-09-24",
    readingMinutes: 5,
    tags: ["Account safety", "Instagram rules"],
    body: [
      { p: "\"Will this get my account banned?\" is the first question anyone asks about DM automation, and it's the right one. Restrictions don't come from automation itself — they come from automation that breaks Instagram's rules." },
      { h2: "What gets accounts in trouble" },
      { ul: [
        "**Unofficial access.** Tools that ask for your password, run in a browser extension, or simulate taps on your phone are working outside Meta's API. Instagram detects that behaviour.",
        "**Messaging outside the window.** Sending DMs to people who haven't interacted with you in the last 24 hours — \"DM all my followers\" — breaks the messaging rules.",
        "**Multiple private replies to one comment.** Instagram allows one. A tool that retries carelessly can send two.",
        "**Misusing the human agent tag.** Attaching it to automated messages to stretch the 7-day window.",
        "**Bursts.** Hundreds of near-identical messages in minutes when a Reel goes viral.",
        "**Ignoring opt-outs.** Continuing to message people who asked you to stop.",
      ] },
      { h2: "What a safe tool does instead" },
      { p: "Every one of those has a fix, and it has to be built into the tool — not left to the user to remember." },
      { ul: [
        "Uses **only Meta's official Instagram API**, connected through Instagram's own login screen. No password, ever.",
        "Checks the **24-hour window** before every message, and skips anything outside it.",
        "Claims each comment's **one private reply** atomically, so a retried webhook can't send a second.",
        "Uses the human agent tag **only on replies a person typed**.",
        "Keeps to **conservative rate limits** and slows down automatically when a post spikes.",
        "Honours **STOP** immediately.",
      ] },
      { p: "That's exactly how InstaDM247 is built: all of those checks live in one place that every message passes through, and they apply on every plan — free included. See [account safety](/features/account-safety)." },
      { h2: "The Safety Center" },
      { p: "When a message isn't sent, you should know why. InstaDM247's Safety Center lists every skipped message with a plain-language reason — window closed, already replied to that comment, opted out — so a rule never looks like a bug." },
      { callout: { title: "A good test for any tool", body: "Ask whether it needs your Instagram password, and whether it can message people who haven't interacted with you. If the answer to either is yes, it isn't using Meta's official API the way Meta intends." } },
    ],
  },
  {
    slug: "automate-instagram-story-reactions-and-replies",
    title: "Story reactions vs replies: automating both without being annoying",
    description:
      "How Instagram delivers story replies, emoji reactions and mentions to apps — and how to answer each one differently so a 🔥 doesn't get a sales pitch.",
    published: "2026-09-24",
    readingMinutes: 4,
    tags: ["Stories", "Guides"],
    body: [
      { p: "Your stories get three kinds of response: written replies, quick emoji reactions, and @mentions. They mean different things, so they deserve different answers." },
      { h2: "How Instagram delivers them" },
      { ul: [
        "A **written reply** arrives as a DM that points back to your story.",
        "A **quick reaction** — a tap on the emoji bar under your story — arrives the same way: a story reply whose text is just the emoji.",
        "A **mention** arrives as a DM with the story attached.",
        "A **heart like** on a story is not sent to apps at all. No tool can automate a reply to it.",
      ] },
      { p: "Because a reaction is \"a story reply that's only emoji\", a tool can tell the two apart by looking at the text. InstaDM247 does exactly that." },
      { h2: "Answer each one on its own terms" },
      { ul: [
        "**Reactions** are low-effort appreciation. A short thank-you, maybe with a link to the thing in the story, is plenty.",
        "**Written replies** are questions or intent. Answer the question — with keywords, or with AI trained on your FAQ.",
        "**Mentions** are free promotion. Thank them, and consider a small reward like a discount code.",
      ] },
      { p: "In InstaDM247, a story automation can be set to **emoji reactions only**, **written replies only**, specific keywords, or everything — so you can run one for each." },
      { h2: "Don't overdo it" },
      { p: "Someone who reacts to five stories in a row shouldn't get five DMs. Set story automations to fire once per person, or after a cooldown." },
      { callout: { title: "The window is already open", body: "A story reply or reaction starts a conversation, so your answer lands inside Instagram's 24-hour window — and if they reply, the conversation continues." } },
    ],
  },
  {
    slug: "capture-emails-in-instagram-dms",
    title: "How to capture emails in Instagram DMs (and send them to Google Sheets)",
    description:
      "Collect emails and answers inside the DM instead of on a landing page, then send every lead to Google Sheets, Kit or Flodesk automatically.",
    published: "2026-09-24",
    readingMinutes: 5,
    tags: ["Lead capture", "Guides"],
    body: [
      { p: "Every extra tap between \"I'm interested\" and \"here's my email\" loses people. Asking inside the DM — where the conversation already is — removes the landing page entirely." },
      { h2: "The flow" },
      { ol: [
        "Someone comments your keyword, replies to a story, or DMs you.",
        "They get the link they asked for.",
        "You ask one question: \"Want the full guide by email?\"",
        "They reply with their address, and it's saved.",
      ] },
      { p: "Because they replied, Instagram's 24-hour window is open and the conversation can continue — a thank-you, a second question, a coupon." },
      { h2: "Keep it short" },
      { ul: [
        "Ask for one thing at a time. Email first; anything else can come later.",
        "Say what they get: \"the printable version\", \"early access\", \"10% off\".",
        "Use buttons for multiple-choice questions so answering is a tap.",
      ] },
      { h2: "Where the leads should go" },
      { p: "In InstaDM247, a [lead form](/features/lead-capture) saves every answer to your contacts, and can send it on automatically:" },
      { ul: [
        "**Google Sheets** — connect with Google and every completed form becomes a row, one tab per form. We ask Google only for access to the spreadsheet we create, nothing else in your Drive.",
        "**Kit** or **Flodesk** — every email lands in your list or segment.",
        "**Your own system** — a webhook fires for every lead.",
      ] },
      { p: "You can also export any form's responses as CSV or Excel whenever you like." },
      { h2: "Surveys and quizzes" },
      { p: "The same flow can ask more than one question — a survey, or a quiz that scores the answers — and the results land in the same places." },
      { callout: { title: "Respect the answer", body: "If someone replies STOP, they're suppressed from automations immediately. An email list built on consent is the only kind worth having." } },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
