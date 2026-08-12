# Feature Matrix — Competitor Research & Phase 1 Scope

Researched August 2026. Sources are competitor marketing/help pages and third-party
comparisons (their sites are not directly reachable from the build environment, so
feature names below are quoted from their published help docs, blog posts and
independent reviews — see "Sources" at the bottom).

**Phase 1 scope = the union of everything both competitors ship.** Anything marked
`P2` is deferred and must not be built without the owner asking.

---

## A. LinkDM — researched feature set

| # | LinkDM feature | Their description (as published) | Our Phase 1 implementation |
|---|---|---|---|
| L1 | **Comment-to-DM** on posts & Reels | Auto-DM anyone who comments | `TRIGGER_COMMENT` + private-reply dispatch |
| L2 | **Trigger types: "All Comments" / "Specific Keywords"** | DM everyone, or only those using a keyword | `matchMode: ALL \| KEYWORD` on the trigger |
| L3 | **Story reply auto-reply** | Auto-DM users who reply to a story, keyword or all | `TRIGGER_STORY_REPLY` |
| L4 | **Story mention auto-reply** | Auto-DM users who @mention you in their story (giveaway entries) | `TRIGGER_STORY_MENTION` |
| L5 | **Inbox Conversation Starters** | Up to 5 starters, max 80 chars, 4 displayed; click sends Message / Button template / Video / Image | Ice Breakers manager + `TRIGGER_ICE_BREAKER` |
| L6 | **Flow Automation** | Starter DM opens the 24h window, then a sequence of follow-ups | Visual flow graph; this is our core primitive |
| L7 | **Custom DM steps** | Up to **8** custom DMs per flow, each delayed **1 min – 24 h** after the Starter DM | `DELAY` node, validated to the 24h window |
| L8 | **Reminder DM** | Timed nudge inside the window | `DELAY` + `SEND_MESSAGE`, shipped as a preset |
| L9 | **Follower Growth Tool** | On CTA click, check if the user follows; send the growth DM **only to non-followers**, skip if already following | `CONDITION` node, `is_follower` check via User Profile API |
| L10 | **Multi-Slide Button Template** | Up to **10 slides** in one DM (outfit links, recipes, affiliate offers) | Generic-template carousel builder, max 10 elements |
| L11 | **DM Planner** | Write AutoDMs in advance, drop a **draft code** in the caption; when the post goes live (manual or via Later/Buffer/Meta Suite) it detects the code and activates | `PlannedAutomation` + caption draft-code scanner |
| L12 | **Universal Triggers** | One automation applies across posts / ads / boosted content | `scope: UNIVERSAL` on the automation |
| L13 | **Advertising Automation** | DM automation on ads & boosted posts (`ad_id` / `ad_title` on the webhook) | Ad-scoped triggers; ad metadata captured on the event |
| L14 | **Broadcasts** | "Send timely DMs to active contacts" | Broadcast composer + audience segment + window-safe batching |
| L15 | **Slow Down Mode** | Account-safety throttle; stays on **2 hours** then resumes normal timing | Per-account throttle with auto-expiry, manual + automatic trigger |
| L16 | **Public comment auto-reply** | Reply in the public comment thread as well as the DM | `REPLY_TO_COMMENT` node (separate API surface from private replies) |
| L17 | **IG Live automation** | Auto-reply to Live comments | `TRIGGER_LIVE_COMMENT` (send only during the broadcast) |
| L18 | **Performance analytics** | Sent, Open, Click, CTR, new followers; link-click analytics | Analytics module + tracked link redirector |
| L19 | **Lead generation** | Capture leads from DM | Lead forms in DM + contact records |

## B. SendDM — researched feature set

| # | SendDM feature | Their description (as published) | Our Phase 1 implementation |
|---|---|---|---|
| S1 | **Auto Comment Reply** | Auto-reply + DM anyone commenting a keyword | Same engine as L1/L16 |
| S2 | **Story Auto Reply** | Story reply automation | L3 |
| S3 | **Live Auto Reply** | IG Live comment automation | L17 |
| S4 | **DM Auto Reply** | Keyword triggers on inbound DMs | `TRIGGER_DM_KEYWORD` |
| S5 | **Ask for Follow** | Timely prompt nudging engagers to follow before delivering the payload | `ASK_FOR_FOLLOW` node (gate + re-check) |
| S6 | **Smart Re-engage** | Automatically send reminder messages at a scheduled time to re-engage and boost sales | Re-engagement scheduler over eligible contacts |
| S7 | **Collect User Data** | Forms for data collection, surveys, orders, quizzes inside Instagram DM; responses downloadable as Excel | `COLLECT_INPUT` node + Form builder + CSV/XLSX export |
| S8 | **Unlimited Message Templates** | Reusable saved messages | Template library |
| S9 | **Basic + Advanced keyword triggers** | Exact / contains / multi-keyword / negative keywords | Full keyword matcher (see §D) |
| S10 | **Multi Instagram accounts** | 1 / 5 / 10 accounts by tier | Many `InstagramAccount` per workspace, no cap in Phase 1 |
| S11 | **Analytics dashboard** | Performance reporting | Shared with L18 |
| S12 | **WhatsApp / Email redirect** | Push the conversation to WhatsApp or email | Link/CTA presets + tracked redirect |
| S13 | **Lead captures** | Capture and store leads | Shared with L19/S7 |
| S14 | **AI auto-reply** | AI answers DMs | AI Agent node + knowledge base |
| S15 | **Meta-approved endpoints, respects rate limits** | Safety positioning | Dispatcher-enforced; Safety Center UI surfaces it |

---

## C. Phase 1 — consolidated build checklist

### 1. Account & connection
- [x] Email/password auth, workspaces, multi-user seam
- [x] **Business Login for Instagram** OAuth (`instagram_business_basic`,
      `instagram_business_manage_messages`, `instagram_business_manage_comments`)
- [x] Long-lived token exchange + automatic refresh before 60-day expiry
- [x] Connect **multiple** Instagram accounts per workspace
- [x] Webhook subscription management + signature verification
- [x] Deauthorize + data-deletion callbacks (Meta App Review requirement)

### 2. Triggers (all of them)
- [x] Comment on post
- [x] Comment on Reel
- [x] Comment on **ad / boosted** post (captures `ad_id`, `ad_title`)
- [x] **Live** comment
- [x] Story reply
- [x] Story mention
- [x] Inbound DM keyword
- [x] Ice breaker / conversation starter click
- [x] Button postback click
- [x] `ig.me` / referral link entry
- [x] **Universal** trigger (any media, incl. future posts)
- [x] Per-media trigger with media picker
- [x] **DM Planner** draft-code trigger for not-yet-published posts

### 3. Keyword matching
- [x] All comments (no keyword)
- [x] Contains / exact / starts-with / regex
- [x] Multiple keywords per trigger
- [x] **Negative keywords** (exclusions)
- [x] Case & accent insensitive, emoji-safe
- [x] Fuzzy/typo tolerance toggle

### 4. Flow engine nodes
- [x] Send message (text)
- [x] Send image / video / audio
- [x] Send **button template** (CTA buttons: URL / postback)
- [x] Send **multi-slide carousel**, up to 10 slides
- [x] Public comment reply
- [x] Delay (1 min – 24 h, window-validated)
- [x] Condition / branch (follower status, tag, custom field, time, previous answer)
- [x] **Ask for follow** gate
- [x] **Follower growth** check (skip if already following)
- [x] Collect input (lead form / survey / quiz step)
- [x] AI agent reply
- [x] Add / remove tag
- [x] Set custom field
- [x] Randomizer (A/B split)
- [x] HTTP request / webhook out
- [x] Hand off to human (opens Inbox, `HUMAN_AGENT` only on real human replies)
- [x] End / goal reached

### 5. Messaging & safety
- [x] 24-hour messaging window tracking per contact
- [x] One private reply per comment id, ever
- [x] 7-day private-reply deadline (broadcast-only for Live)
- [x] Per-account rate limiting with token bucket + queue
- [x] **Slow Down mode** — manual and auto, 2-hour expiry
- [x] Retry with backoff, dead-letter queue, error surfacing
- [x] Opt-out / STOP keyword handling + suppression list
- [x] Duplicate-webhook idempotency

### 6. Inbox
- [x] Unified live chat across connected accounts
- [x] Conversation list, search, filters, unread state
- [x] Human reply (correctly tagged), automation pause per conversation
- [x] Contact profile panel with tags, fields, flow history

### 7. Contacts / CRM
- [x] Auto-created contacts from every interaction
- [x] Tags, custom fields, notes
- [x] Segments (saved filters)
- [x] CSV + XLSX export
- [x] Lead form responses attached to the contact

### 8. Broadcasts & re-engagement
- [x] Broadcast composer targeting a segment
- [x] Window-eligibility preview (who can legally receive it)
- [x] Scheduled send
- [x] **Smart re-engage** recurring campaign

### 9. Templates & assets
- [x] Reusable message templates
- [x] Ice breakers manager (max 5, 80 chars, 4 shown)
- [x] Persistent menu manager
- [x] Tracked links with click attribution
- [x] WhatsApp / email redirect presets

### 10. AI
- [x] AI agent with per-account persona + tone
- [x] Knowledge base (docs/FAQ) with retrieval
- [x] Guardrails: fallback to human, banned topics, max turns
- [x] AI used as a flow node, not a bypass of the dispatcher

### 11. Analytics
- [x] Per-automation: triggered, sent, delivered, opened, clicked, CTR
- [x] New followers attributed to automations
- [x] Link click analytics
- [x] Funnel / drop-off per flow node
- [x] Time-series charts + date range
- [x] Account health: rate-limit headroom, errors, window misses

### 12. Marketing site
- [x] Interactive, animated landing page (explicitly not "plain AI generated")
- [x] Live comment→DM demo, flow-builder preview, feature deep-dives
- [x] Legal pages required for Meta App Review (privacy, terms, data deletion)

---

## D. Phase 2 — deferred, DO NOT BUILD YET

- Pricing, plans, quota enforcement, Stripe billing (seam exists, inert)
- Team seats, roles & permissions
- Additional channels (WhatsApp Business, Messenger, TikTok)
- Native e-commerce catalogue / checkout in DM
- Zapier / Make / native CRM integrations
- White-label & agency multi-client mode
- A/B testing suite with statistical significance
- Advanced AI: autonomous sales agent, voice notes, image understanding
- Public API + developer webhooks for customers
- Mobile app

---

## Sources

- LinkDM: trigger types, flow automation (starter DM + up to 8 custom DMs, 1 min–24 h),
  follower growth tool, slow-down mode (2 h), DM planner (draft codes), universal
  triggers, multi-slide button template (10 slides), inbox conversation starters
  (5 max / 80 chars / 4 shown), broadcasts, boosted-post automation, performance
  analytics (Sent, Open, Click, CTR, new followers) — from linkdm.com help & blog pages
  surfaced via search, plus independent comparisons (creatorflow.so, inro.social,
  jotform.com, dmly.io).
- SendDM: auto comment reply, story auto reply, live auto reply, DM auto reply, ask for
  follow, smart re-engage, collect user data (forms/surveys/orders/quizzes, Excel
  export), unlimited message templates, basic+advanced keyword triggers, multi-account,
  analytics dashboard, WhatsApp/email redirect, lead captures, "only Meta-approved
  endpoints, respects rate limits" — from senddm.ai home/pricing surfaced via search,
  plus liffio.com and flowgent.ai comparisons.
- Meta API constraints: `docs/META_API.md` (sourced from developers.facebook.com via the
  Meta Developer Tools MCP — authoritative).
