/**
 * The product guide the AI Helper answers from. See docs/HELPER.md.
 *
 * This is the helper's ONLY knowledge of how InstaDM247 works, so it has to
 * match the UI exactly: page names as they appear in the sidebar, button and
 * field labels as they are written on screen, and nothing that isn't built.
 * When a page's labels or behaviour change, change its section here in the
 * same PR — a helper that sends someone to a button that doesn't exist is
 * worse than no helper. `pnpm e2e` checks every path below is a real page and
 * that nothing here names our infrastructure (CLAUDE.md rule 8).
 *
 * Plan limits are deliberately not written here: they come from the
 * workspace's live plan through the helper's tools, so they can't drift.
 */

export type GuideSection = {
  id: string;
  title: string;
  /** The dashboard page this section is about, if any. */
  path?: string;
  body: string;
};

export const GUIDE: GuideSection[] = [
  {
    id: "basics",
    title: "How InstaDM247 works",
    body: `InstaDM247 automates an Instagram professional account (Business or Creator) using only Instagram's official API.
The core idea: an **automation** listens for something on Instagram (a comment, a story reply, a DM…) and runs a **flow** (a chain of steps like "Send DM", "Wait", "If / else") for the person who did it.

The sidebar is grouped as:
- Overview: Dashboard
- Engage: Automations, My content, Inbox, Broadcasts, DM Planner, Scheduler
- Audience: Contacts, Lead forms, Link in bio
- Intelligence: Analytics, AI agent, AI Helper
- Account: Instagram accounts, Safety Center, Templates, Developers, Plan & billing, Settings

Instagram's rules, which InstaDM247 enforces automatically on every plan:
- **24-hour messaging window**: you can only DM someone within 24 hours of their last message, comment-triggered private reply, or story interaction. After that, messages are skipped, not sent.
- **One private reply per comment**, and only within 7 days of the comment (for Live comments, only while the broadcast is live).
- **Hourly rate limits** per account. Messages over the limit are queued and retried.
- **Slow Down mode** and **viral post protection** throttle sending when a post suddenly takes off, so the account doesn't look like a bot.
Nobody can DM people who have never interacted with the account. There is no "mass DM to followers", because Instagram doesn't allow it.`,
  },
  {
    id: "connect",
    title: "Connecting Instagram",
    path: "/dashboard/accounts",
    body: `Go to **Instagram accounts** → **Connect Instagram**. You sign in on Instagram's own screen and approve messaging permissions; we never see the password.
- The account must be a **Professional** account (Business or Creator). Personal accounts can't be automated. Switch in the Instagram app under Settings → Account type and tools.
- To let automations reply to DMs, in the Instagram app turn on Settings → Messages and story replies → Message controls → Connected tools → **Allow access to messages**.
- **Sync** on an account card pulls in your recent posts so you can pick specific posts in automations.
- If a card says **Reconnect needed** or **Access revoked**, click **Reconnect @username**. Automations for that account are paused until you do.
- If a card says webhooks aren't subscribed, click **Retry subscription**; until then triggers won't fire for that account.
- **Connect another account** adds more accounts, up to your plan's limit.`,
  },
  {
    id: "automations",
    title: "Creating an automation",
    path: "/dashboard/automations/new",
    body: `**Automations** → **New automation** opens a 3-step wizard:
1. **Trigger**: pick the account (if you have several) and what starts it:
   - Comment on a post or Reel (classic comment-to-DM)
   - Story reply or reaction
   - Story @mention (great for giveaways)
   - Live comment (during a broadcast)
   - DM keyword (someone messages you)
   - Comment on an ad or boosted post
   - Conversation starter (they tap a starter in your inbox)
2. **Match**: who it responds to: **Only specific keywords** (comma separated; matching ignores case, accents and emoji) or **Everyone**. For story replies there are also **Emoji reactions only** and **Written replies only**. For comment triggers choose **Which posts?**: All my posts and Reels / Only the posts I pick / Everything, including future posts and ads / Only ads and boosted posts.
3. **Flow**: name it and pick a starting template, then **Create and build the flow**. The name is filled in from the keyword and where it listens, e.g. "LINK · New drop is live (Oct 2)" for one post or "LINK · all posts", and you can change it. You're warned if another automation on the account has the same name.

On the **Automations** list, an automation on picked posts shows their thumbnails and how many posts it's on.

**When several automations match the same comment, only one runs** (a comment can get one private reply). The most specific wins: picked posts, then ads only, then all posts, then everything. Between equals, the most recently edited wins. If the winner won't run for that person (its re-entry setting, e.g. once per person), nothing else runs instead.

Starting templates: Comment to DM · Follower growth gate · Capture an email · Story mention giveaway · Thank people who react to your story · Follow up if they don't reply · AI answers your FAQ · Start from scratch.

New automations are created **switched off**. Finish the flow, press **Save**, then flip the switch at the top right to **Live**. An automation with errors in its flow can't be switched on.

A "Button tapped" trigger (for DM main menu items) and "Referral link opened" can be chosen afterwards in the automation's **Trigger settings** tab.`,
  },
  {
    id: "editor",
    title: "The automation editor",
    path: "/dashboard/automations",
    body: `Open any automation from **Automations**. The switch at the top right turns it Live / Paused. Tabs:
- **Flow**: the visual builder (below).
- **Trigger settings**: Trigger, Which content, Match mode, Keywords, **How to match** (Message contains / is exactly / starts with the keyword / Regular expression), **Never respond to** (negative keywords that win over everything), **Forgive typos**, and **How often it can run** per person: Once per post (recommended) / Only ever once / Once per cooldown period / Every single time. Press **Save settings**.
- **Performance**: how many people reached each step.
- **Rewind**: DM the people who commented *before* the automation existed: **Check who's eligible**, then **Send to all N**. Only comments from the last 7 days that haven't had a private reply qualify.
The automation's name is editable by clicking it. **Delete** is at the bottom of Trigger settings. If the flow has errors, switching it Live is refused with the first error.`,
  },
  {
    id: "builder",
    title: "Building a flow",
    path: "/dashboard/automations",
    body: `In the **Flow** tab, click **Add a step** to add a step, drag from a step's output dot to the next step to connect them, and click a step to edit it in the panel on the right. Press **Save** (or ⌘S / Ctrl+S). The badge top-right shows **Valid**, warnings, or "N to fix".

Steps:
- **Send DM**: a message: Text, Buttons (up to 3; link buttons), Carousel (up to 10 slides) or Image. **Send as a private reply** replies privately to the triggering comment. Use it on the first DM of a comment flow. A comment gets only one private reply, so if an earlier step already sent it (an Ask for follow, for example), this step goes as a normal DM instead.
- **Reply publicly**: replies in the comment thread; add several replies and one is picked at random.
- **Wait**: pause up to 24h. The whole flow's waits can't exceed 24h (Instagram's window).
- **If / else**: branch on: follows you, has a tag, custom field, variable, message text, hour of day, first time, or **replied** (they messaged since the flow last sent them something; useful for follow-ups).
- **Follower check**: branch yes/no on whether they follow you. Instagram only tells us once the person has messaged you or tapped one of your buttons, so for someone who has only commented it takes the no path. Use Ask for follow for them.
- **Ask for follow**: sends your message with a button (**Button**, default "I've followed ✅"). When they tap it, we check whether they follow you: yes continues down yes; if not, they get **If they tap but aren't following yet** once with the button again, and the next tap continues down yes or no. If nobody taps within **Wait for a tap**, it takes no. From a comment, this message is the private reply, so someone who never taps or replies can't be messaged again and the flow stops there. People who already follow skip it.
- **Ask a question**: asks something in the DM and saves the answer; can **Save to a lead form** (pick the form and **Which question**). Turn on **Save to the contact** to also keep the answer on their contact as a custom field (you choose its name), so broadcasts and other automations can use it, e.g. {{email}}. Off, the answer is only usable later in the same automation. Has a "no reply" path after **Give up after**.
- **AI replies**: answers from your AI agent's knowledge base; hands to you when unsure.
- **Send a coupon**: issues a code from a coupon pool (paste the pool ID from Templates → Coupons); "ran out" path when empty.
- **Tag contact**, **Set field**: label people or store values.
- **Split test**: send people down different paths by weight.
- **Call a webhook**: send data to another system.
- **Hand to a human**: stops automating and flags the thread in the Inbox.
- **End**: finishes; **Count as a conversion** marks it as a goal in analytics.

Personalise any message with tokens: {{first_name}}, {{full_name}}, {{username}}, {{keyword}}, {{trigger_text}}, {{account_username}}, {{coupon}}, plus any answer saved by Ask a question (e.g. {{email}}) and any custom field on the contact.
Up to 8 DMs after the starter DM is the safe ceiling.`,
  },
  {
    id: "recipes",
    title: "Common recipes",
    body: `- **Send a link when people comment a keyword**: New automation → Comment on a post or Reel → Only specific keywords (e.g. LINK) → Comment to DM template → edit the Send DM button URL → Save → switch Live. Tell people in the caption: "Comment LINK and I'll DM it to you".
- **Grow followers**: use the Follower growth gate template. Commenters are asked to follow and tap "I've followed"; followers get the link on the tap. There's no way to react the moment someone follows you: Instagram doesn't tell apps about new followers.
- **Collect emails**: Capture an email template, or add Ask a question with Answer type Email. To export or sync them, create a form under Lead forms and choose it in **Save to a lead form**.
- **Sell a product**: comment-to-DM on the product post with keyword (e.g. BUY/PRICE) → Send DM with a Buttons message linking to the checkout (use a tracked link from Templates → Tracked links to count clicks) → optional Send a coupon → Wait 4h → If / else "replied" → a gentle nudge on the "no" path. Put the keyword in the caption and in a story.
- **Giveaways**: Story mention giveaway template; entrants are tagged "giveaway-entry" so you can filter them in Contacts.
- **Answer FAQs automatically**: fill the AI agent's knowledge base, then use the AI answers your FAQ template.
- **Automation for a post you haven't published yet**: DM Planner (draft code in the caption) or the Scheduler.
- **Follow up if they don't reply**: the Follow up if they don't reply template (nudges at 4h and ~23h, skipped for people who replied).`,
  },
  {
    id: "inbox",
    title: "Inbox",
    path: "/dashboard/inbox",
    body: `**Inbox** shows every conversation across connected accounts, updating live. Type a reply at the bottom to answer yourself. Your own replies are never limited by your plan.
- **Pause automation for this thread** stops automations messaging that person while you handle it ("You're handling this").
- Inside the 24-hour window, a reply you type goes out like any other message. Automations stop 24 hours after the person's last message; after that, a reply you type yourself can sometimes still go out for up to 7 days, marked "· human". If Instagram doesn't allow it, the message says so, and you can reply as soon as they message you again.
- People show by their @username. Someone who messages you first is looked up on Instagram to get it, which can take a moment; if Instagram doesn't share it, they show as their name or "Instagram user".
- The speaker and bell buttons turn on a sound and desktop notifications for new messages (your browser asks permission the first time).`,
  },
  {
    id: "broadcasts",
    title: "Broadcasts",
    path: "/dashboard/broadcasts",
    body: `**Broadcasts** → **New broadcast**. It only reaches people whose 24-hour window is still open. The page shows how many are reachable right now.
- Type: **One-off broadcast** or **Smart re-engagement** (a recurring nudge for contacts who went quiet; set **Nudge after (hours)** and **Repeat**).
- Pick the account, a name and the message. Type **{{** in the message (or click a field under it) to add a field: {{first_name}}, {{full_name}}, {{username}}, {{account_username}}, and any custom fields your contacts have. Each person gets their own value; a field someone doesn't have is left blank. Keyword, trigger text and coupon only work inside automations.
- Optionally **Only contacts tagged**: search and pick from the tags your contacts already have (it shows how many carry each). Anyone with at least one of the picked tags is included. Or pick a saved segment.
- **Send now** (or **Start campaign** for re-engagement), or **Save as draft**. Each broadcast shows Sent / Skipped / Failed.`,
  },
  {
    id: "planner",
    title: "DM Planner",
    path: "/dashboard/planner",
    body: `Use it to have an automation go live on a post you haven't published yet, from any posting tool.
1. Build the automation as normal (leave it off).
2. **DM Planner** → **Plan an automation** → choose the account and **Automation to activate**.
3. **How should it attach?** **Draft code** (you get a code like DM-K7QP2X to paste anywhere in the caption) or **Next post** (attaches to whatever you publish next).
4. **Create plan and get my code**, then publish. Within about five minutes the code is spotted, the automation is attached to that post and switched on. **Check for the post now** checks immediately.`,
  },
  {
    id: "scheduler",
    title: "Scheduler",
    path: "/dashboard/scheduler",
    body: `**Scheduler** → **Schedule a post**:
1. Choose the **Account** and **Type** (Image, Reel, Video, Carousel).
2. **Media**: drop files in or click **Choose from your device**. Image takes one photo, Reel and Video take one video, Carousel takes 2 to 10 photos and videos (reorder them with the arrows). Each file is checked against Instagram's rules before you can schedule:
   - Photos: any photo works and is converted to JPEG. The shape must be between 4:5 (portrait) and 1.91:1 (landscape). A photo that's too tall or too wide shows **Crop to 4:5 portrait**, **Crop to 1:1 square** or **Crop to 1.91:1 landscape**, which crop from the centre. Up to 8 MB after converting. HEIC photos only work in browsers that can open them; on iPhone, Camera > Formats > Most Compatible saves JPEGs.
   - Videos: MP4 or MOV, 3 seconds to 15 minutes, up to 300 MB. 9:16 (like 1080 × 1920) fills the screen; other shapes get a warning because Instagram crops them or adds bars. In a carousel, videos can be up to 60 seconds.
   - Carousel: every slide is cropped to the first slide's shape, so you get a warning if they differ.
   Red text blocks scheduling; orange text is a warning you can ignore. **Or paste a link to a file** adds a public HTTPS link instead; those can't be checked until Instagram publishes them.
3. Write the **Caption**, and pick **When**.
4. Under **Switch these on when it publishes**, pick any automations to attach to the post. They're enabled automatically when it goes live.
5. **Schedule**. From the list you can publish a scheduled post right away, cancel it, or delete it. Uploaded files are kept only until the post is published (a few days after, in case you need them), then deleted.`,
  },
  {
    id: "content",
    title: "My content",
    path: "/dashboard/content",
    body: `**My content** shows your posts and Reels, and your live stories, with the automations that answer on each.
- **Posts & Reels**: every post with its comment and like counts and the comment automations that cover it, in the order they'd answer (picked posts first, then ads only, then all posts, then everything; between equals, the most recently edited). A green dot answers; orange means it **never runs here** because another answers first, or answers first only for some of its keywords; grey is paused. **New automation for this post** starts the wizard on that post. **Sync posts** pulls your latest posts from Instagram.
- **Stories**: only stories that are live right now (the last 24 hours), with how long each has left. Story reply and reaction automations answer on every story, so they're listed once at the top.`,
  },
  {
    id: "contacts",
    title: "Contacts",
    path: "/dashboard/contacts",
    body: `**Contacts** lists everyone who interacted with your automations, with tags and follower status. Filter by Everyone / Reachable now / Followers / Not following / Opted out, or by tag. **Export** downloads a CSV.
- **Tag one contact**: click the pencil next to their tags, pick an existing tag or type a new one (it offers **New tag**), remove one with its ×, then the tick to finish. Changes save as you make them.
- **Tag many**: tick contacts (the box in the header ticks everyone shown), pick tags in the bar that appears, then **Add to N** or **Remove from N**.
- Contacts also get tags from a **Tag** step, and custom fields from **Set field** or **Ask a question** with **Save to the contact** on. Names, usernames and follower status come from Instagram.`,
  },
  {
    id: "forms",
    title: "Lead forms",
    path: "/dashboard/forms",
    body: `**Lead forms** → **New form**. Give it a name, a type (Form, Survey, Quiz, Order) and questions (text, email, phone, number, choice, rating).
Forms are asked inside the DM: in an automation, add one **Ask a question** step per question and choose the form under **Save to a lead form** and the question under **Which question**. Chain them one after another. When every question is answered the response is complete: it shows on the form, exports as CSV or Excel, and is sent to Google Sheets, Kit or Flodesk if connected (Developers → Integrations).
To thank people when they finish, add a Send DM step after the last question.`,
  },
  {
    id: "bio",
    title: "Link in bio",
    path: "/dashboard/bio",
    body: `**Link in bio** → create a page: title, **Link** (your page's address; it tells you as you type if it's taken), bio, theme, avatar and the Instagram account. Add blocks: Link, Heading, Text, Email, WhatsApp, Product; reorder or hide them. Switch **Published** on and paste **Your link** into your Instagram bio. Every tap is counted.
On the Free plan the "Made with InstaDM247" badge always shows; on paid plans you can turn off **Show badge**.`,
  },
  {
    id: "templates",
    title: "Templates & assets",
    path: "/dashboard/templates",
    body: `**Templates** has tabs:
- **Messages**: save replies you reuse (copy the text into a Send DM step or an Inbox reply).
- **Tracked links**: wrap any URL; use it in DM buttons and clicks show up in Analytics.
- **Coupons**: pools of codes: one unique code per person (generate with a prefix or paste your own) or one shared code. Copy the **Pool ID** into a Send a coupon step.
- **DM main menu**: the persistent menu in your Instagram DMs. Items open a link or trigger an automation (set up an automation with the "Button tapped" trigger and match the payload). **Save and publish to Instagram**.
- **Conversation starters**: up to 5 tappable prompts shown when someone opens your inbox (Instagram shows 4). Use the Conversation starter trigger to reply to them.`,
  },
  {
    id: "ai-agent",
    title: "AI agent (answers your followers)",
    path: "/dashboard/ai",
    body: `**AI agent** is the assistant that answers *your followers* in DMs (different from this AI Helper, which helps *you* use InstaDM247).
1. **Enable AI agent**, set name, tone, persona, language, **Max replies per conversation**, **Never discuss** topics and a **Fallback message**.
2. Fill the **Knowledge base** with **Add article**: shipping, sizing, FAQs. It only answers from these articles.
3. Add an **AI replies** step to a flow (or use the AI answers your FAQ template). With **Hand off when unsure**, anything it can't answer goes to you in the Inbox.
AI replies are counted against your plan's monthly AI reply allowance.`,
  },
  {
    id: "safety",
    title: "Safety Center",
    path: "/dashboard/safety",
    body: `**Safety Center** shows what the safety checks did: messages skipped (last 7 days) with the reason for each, recent failures Instagram returned, suppressed contacts and policy notices.
Per account you can switch **Automations enabled** off (pause everything), turn **Slow Down mode** on by hand, and toggle **Viral post protection**.
Skips are normal and protect the account, for example a follow-up after the 24h window, or a second private reply to the same comment.`,
  },
  {
    id: "analytics",
    title: "Dashboard & Analytics",
    path: "/dashboard/analytics",
    body: `**Dashboard** shows the last 14 days: automations triggered, DMs sent, open rate, click-through rate, recent runs and busiest automations.
**Analytics** covers 30 days: Triggered, DMs sent, Opened, Clicked, Leads captured, New followers, activity over time, a table by automation, and link clicks. Numbers update as things happen. **Clicked** counts taps on link buttons in your automations' DMs (once per person per message); links typed into message text aren't counted. **CTR** is clicks ÷ DMs sent. **New followers** counts people seen switching to following during an Ask for follow or Follower check. Each automation's own **Performance** tab shows where people drop off in its flow.`,
  },
  {
    id: "developers",
    title: "Developers & integrations",
    path: "/dashboard/developers",
    body: `**Developers** has three tabs:
- **API keys**: create a key to read contacts or send DMs from your own systems (sends still obey the messaging window and rate limits). Copy it when shown; it isn't shown again.
- **Webhooks**: add an endpoint URL to get a POST when things happen (e.g. a lead is captured).
- **Integrations**: **Google Sheets** (connect Google; completed lead form responses go to a spreadsheet called "InstaDM247 leads", one tab per form) and **Kit** / **Flodesk** (paste your API key; captured emails are added to your list).`,
  },
  {
    id: "billing",
    title: "Plan, billing and settings",
    path: "/dashboard/billing",
    body: `**Plan & billing** shows your plan, this month's usage (automated DMs, Instagram accounts) and invoices, and has the upgrade buttons. Usage resets on the 1st of each month. Monthly plans aren't refundable; annual plans can ask support for a partial refund of unused months (see the Refunds page).
**Settings** shows your account and the hourly sending limits.
Safety features (the window, rate limits, Slow Down, viral protection) are on every plan, and replies you type yourself are never limited.`,
  },
];

/** The guide as one block of text, for the model's context. */
export function guideText(): string {
  return GUIDE.map((s) => `## ${s.title}${s.path ? ` (${s.path})` : ""}\n${s.body}`).join("\n\n");
}
