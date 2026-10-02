# Feature Matrix — Competitor Coverage & Phase 1 Scope

**The lists in §A and §B were supplied verbatim by the owner from the competitors'
own sites.** They supersede the earlier search-derived research and are the
authoritative checklist. Do not re-research these; do not drop items from them.

Legend: **Done** shipped · **N/A** not a product feature for us · **P2** deferred
to Phase 2 by an explicit decision recorded below.

---

## A. LinkDM — official feature list (owner-supplied)

| # | LinkDM feature | Their description | Status | Where it lives |
|---|---|---|---|---|
| 1 | **Post AutoDM** | Auto-reply to Instagram Post comments with a DM | Done | `COMMENT` trigger |
| 2 | **Reels AutoDM** | Auto-reply to Instagram Reel comments with a DM | Done | Same trigger; Reels are media |
| 3 | **Facebook AutoDM** | Auto-reply to Facebook comments with a DM | **P2** | See "Facebook channel" below |
| 4 | **Story AutoDM** | Auto-respond to story replies with a DM | Done | `STORY_REPLY` |
| 5 | **Story Mentions** | Auto-reply to story @mentions | Done | `STORY_MENTION` |
| 6 | **Inbox Starters** | Up to 4 conversation starters in your inbox | Done | Ice breakers manager |
| 7 | **Next Post** | Draft your next linked post in advance | Done | Planner → "Next post" mode |
| 8 | **Click Analytics** | Track link click analytics on DMs sent | Done | Every link button in an automation DM goes through `/go/` and counts per automation (CTR); hand-made tracked links at `/r/[code]` |
| 9 | **Flow Automation** | Sequence of DMs and reminders after engagement | Done | Visual flow builder |
| 10 | **Comment Auto-Reply** | Reply to the comment publicly once a DM is sent | Done | `REPLY_TO_COMMENT` node |
| 11 | **White Label** | Remove LinkDM branding from DMs sent | Done | Free plan: the first automated DM a person gets each day ends with a short "Sent with InstaDM247" line, and the Link-in-Bio badge can't be turned off. Paid plans remove both (`removeBranding`). Never on Inbox replies a person typed. `src/lib/branding.ts` |
| 12 | **Multiple Accounts** | Connect up to 3 Instagram accounts | Done | Unlimited in Phase 1 |
| 13 | **Increased DM Send Limit** | 25,000 DMs/account/month | Done | Pro plan: 25,000 automated DMs/month — see `docs/BILLING.md` |
| 14 | **Universal Triggers** | Global triggers across multiple placements | Done | `scope: UNIVERSAL` |
| 15 | **Rewind** | Backsend DMs to eligible comments | Done | Rewind, per automation |
| 16 | **Advertising AutoDM** | Auto-reply to comments on sponsored content | Done | `AD_COMMENT` trigger |
| 17 | **Inbox Automation** | Auto-reply to inbox messages | Done | `DM_KEYWORD` trigger |
| 18 | **Referral Program** | Access our referral program and start earning | **N/A** | LinkDM's own affiliate scheme, not a creator-facing capability |
| 19 | **Lead Generation** | Capture email addresses directly in chat | Done | Lead forms + `COLLECT_INPUT`; "Save to the contact" keeps the answer as a custom field for broadcasts |
| 20 | **DM Planner** | Draft DMs for scheduled posts in advance | Done | Draft codes + scheduler linkage |
| 21 | **DM Templates** | Save and re-use DMs | Done | Template library |
| 22 | **DM Coupons** | Send coupons via DMs | Done | Coupon pools + `SEND_COUPON` node |
| 23 | **API Integrations** | Connect lead forms to Kit and Flodesk | Done | Native Kit + Flodesk, plus generic webhook |
| 24 | **DM Send Limit+** | 300,000 DMs/account/month | Done | Business plan: 300,000 automated DMs/month |
| 25 | **Accounts+** | Up to 10 Instagram accounts | Done | Business plan: 10 accounts (Pro: 3, Free: 1) |
| 26 | **DM Queue** | Advance queue so a DM is never missed | Done | BullMQ dispatch queue + queue view in Safety Center |
| 27 | **Slow Down Mode** | Slow automations when Reels blow up | Done | Manual, auto-on-throttle, and proactive spike detection |

## B. SendDM — capabilities from their pricing page (owner-supplied)

Filtered to actual product capabilities; quotas and support tiers are marked.

| # | SendDM line item | Status | Where it lives |
|---|---|---|---|
| 1 | Unlimited **DM Send Limit** | Done | Metered per plan; see `docs/BILLING.md` |
| 2 | 25,000/mo **AI Credits** | Done | AI replies metered per plan: Pro 1,000, Business 10,000 |
| 3 | **Viral Post Protection** | Done | Proactive comment-spike detection → Slow Down |
| 4 | 20 **Instagram Accounts** | Done | Unlimited |
| 5 | **Comment Auto-Reply** | Done | |
| 6 | **Story Automation** | Done | |
| 7 | **Story Mention Auto-Reply** | Done | |
| 8 | Unlimited **Message Templates** | Done | |
| 9 | Advanced **Keyword Triggers** | Done | contains/exact/starts-with/regex, negatives, typo tolerance |
| 10 | **Analytics Dashboard** | Done | |
| 11 | **Contact Management** | Done | Search and filter; add and remove tags per contact or in bulk (`/api/contacts/tags`) |
| 12 | **Contact Export** | Done | CSV + XLSX |
| 13 | **WhatsApp/Email Redirect** | Done | One-click presets in the message editor |
| 14 | **Priority Support** | **N/A** | Service tier, not software |
| 15 | **API Access** | Done | Scoped API keys + outbound webhooks |
| 16 | **Custom Integrations** | Done | `HTTP_REQUEST` node + outbound webhooks |
| 17 | **Dedicated Account Manager** | **N/A** | Service tier |
| 18 | **SLA Guarantee** | **N/A** | Contractual, not software |
| 19 | Unlimited **Schedule & Auto-Post** | Done | Content scheduler (`instagram_business_content_publish`). Upload from device; every file checked against Instagram's shape, size and length rules before scheduling, with crop-to-fit for photos. See `docs/SCHEDULER.md` |
| 20 | 300MB **Large Video Uploads** | Done | Videos up to 300 MB (Instagram's limit) uploaded from device and streamed to disk; links still accepted |
| 21 | 4 **Conversation Starters** | Done | Ice breakers (5 stored, 4 shown — Instagram's limit) |
| 22 | 20 items **DM Main Menu** | Done | Persistent menu manager |
| 23 | Unlimited **Link in Bio Page** | Done | Hosted at `/l/[slug]` |
| 24 | Full history **Link in Bio Analytics** | Done | Per-block click tracking |
| 25 | **Remove Link in Bio Badge** | Done | Toggle on the page; locked on for Free, where the page title also carries "· InstaDM247" |

## B2. Reachlee — added by the owner, 2026-09-24

https://www.reachlee.co. Unlike §A and §B this list is **search-derived**: the
site itself is blocked from the build environment, so it was assembled from
their indexed pages and blog. Re-check it against their site when it can be
read. The owner chose to build every gap found (all four below).

| # | Reachlee capability | Status | Where it lives |
|---|---|---|---|
| 1 | Comment / keyword → DM | Done | `COMMENT`, `DM_KEYWORD` |
| 2 | **Story reactions** fire a DM | Done | `STORY_REPLY` with match mode `REACTION` (emoji-only replies — how Instagram delivers a quick reaction; see `docs/META_API.md` §4). `REPLY` is the reverse. Preset: "Thank people who react to your story" |
| 3 | Growth Gate (follow to unlock) | Done | `FOLLOWER_CHECK` / `ASK_FOR_FOLLOW`. Ask for follow carries an "I've followed" button; the tap is what lets Instagram's profile API answer for a commenter (no follow webhook exists). See `docs/META_API.md` §4 |
| 4 | Email capture in the DM | Done | `COLLECT_INPUT`, lead forms |
| 5 | **Leads to Google Sheets** | Done | Google sign-in (`drive.file`), one tab per form, every completed response a row — `src/lib/integrations/google-sheets.ts`, `docs/INTEGRATIONS.md` |
| 6 | Tracked links | Done | `/r/[code]` |
| 7 | Scheduled messages | Done | Scheduled broadcasts |
| 8 | Live multi-account inbox **with sound** | Done | Inbox refreshes itself (10s / 30s in background), chime and optional desktop alert on new messages (`inbox-live.tsx`) |
| 9 | **Follow-up nudges** when a conversation stalls | Done | CONDITION field `replied` ("Replied since your last message") + preset "Follow up if they don't reply" (4h, then 23h, inside the 24h window) |
| 10 | Automation re-runs | Done | Rewind |
| 11 | AI replies | Done | `AI_REPLY` |

Pricing observed: Free (1,000 DMs, 500 contacts), Pro $9/mo, Business $29/mo.
Not acted on — pricing is the owner's call.

## B3. HeyTrigger — added by the owner, 2026-10-02

https://heytrigger.com. The owner reviewed their product and asked for these five.

| # | HeyTrigger capability | Status | Where it lives |
|---|---|---|---|
| 1 | **My content**: posts, Reels and live stories, with the automations on each | Done | `/dashboard/content`, `src/lib/content.ts`. Stories read live (`GET /me/stories`), only the last 24h. Shows which automation answers first on each post (same ranking as the matcher, `scopeRank`) |
| 2 | Feature requests page (admin emailed) | Done | `/dashboard/requests`, `/admin/requests`; admins emailed, customer emailed on status changes. `docs/SUPPORT.md` |
| 3 | Resources menu and docs | Done | "Resources" dropdown in the site header (Docs, Blog, Compare, Support, Request a feature, Account safety). `/docs` and `/docs/[slug]` are built from the AI Helper's guide (`src/content/docs.ts`), so the docs stay as true as the guide (rule 14); search, grouped sidebar, sitemap |
| 4 | Support center with tickets (admin emailed) | Done | `/dashboard/support`, `/admin/support`; staff emailed on new tickets and replies, customer emailed on our replies. `docs/SUPPORT.md` |
| 5 | Onboarding tour and getting-started checklist | Pending | |

---

## C. Deferred by explicit decision

### Facebook channel (LinkDM #3)
Owner decision, this session: **skip for now.** It requires the Facebook Login
path, Page access tokens, `pages_messaging`, a Page-shaped data model and a
second App Review track — a large parallel integration for one line item.
`src/lib/meta/` keeps the adapter seam. Revisit as a focused piece of work.

### Plans and billing (LinkDM #13, #24, #25; SendDM #1, #2)
Free / Pro / Business, sold through Dodo Payments, defined once in
`src/lib/billing/plans.ts`. Every gated action asks `src/lib/plan.ts`; no feature
code hardcodes a quota. Inert until `BILLING_ENABLED` is set. Refund policy at
`/refunds` (monthly: none; annual: on request, less the months used at the
monthly price; nothing else), processed by
staff from the customer page. Safety features are
included on every plan — unlike both competitors, who charge for them. Full design
in `docs/BILLING.md`.

### Not software (LinkDM #18; SendDM #14, #17, #18)
Referral programme, priority support, dedicated account manager, SLA. These are
commercial arrangements, not things to build.

---

## D. Everything we ship beyond both competitors

Neither competitor offers these; they're why the product wins on merit rather
than parity.

- **Visual drag-and-drop flow builder** with 16 step types and live validation
  against Meta's real messaging rules
- **Unified live-chat inbox** with per-thread human takeover that pauses
  automation for that person only
- **Safety Center** — every skipped send, with a plain-language reason
- **Funnel analytics per flow step**, showing exactly where people drop off
- **AI grounded in your knowledge base**, with an honest handoff instead of a
  hallucinated answer
- **Follower-growth gate** and **ask-for-follow** as first-class flow steps
- **In-DM forms, surveys and quizzes** with CSV *and* Excel export
- **Broadcast eligibility preview** — the reachable count before you send
- **AI Helper** (built on the owner's request) — an in-dashboard assistant for
  the account owner: step-by-step answers about any feature, automation plans
  for a goal, one-click *draft* automations (created switched off), and
  troubleshooting from the workspace's own setup and skip reasons. Read-only;
  every plan, metered per week (Free 5, Pro 20, Business 50). `docs/HELPER.md`
- **Account and notification email** (built on the owner's request) — email
  verification, password reset, and notices for subscription changes, failed
  payments, renewals, usage limits, Instagram reconnects and suspensions, via
  Amazon SES from `accounts@`, `billing@` and `alerts@`. Inert until SES is
  configured. Full list in `docs/EMAIL.md`

---

## E. Phase 2 — do not build without being asked

- ~~Pricing, plans, quota enforcement, billing~~ — built on the owner's request; see §C
- Team seats, roles and permissions
- Facebook / WhatsApp / Messenger / TikTok channels
- Catalogue and checkout inside the DM
- White-label and agency multi-client mode
- A/B testing with statistical significance
- Mobile app

---

## F. Design direction

**Comic / cartoon**, chosen by the owner this session, replacing the original
dark "precision SaaS" look. Ink outlines, halftone and Ben-Day dot overlays,
hard offset shadows, burst animations on button hover, speech-bubble surfaces,
action lines, heavy display type.

Applied at **full intensity on the marketing site and auth**, and **restrained in
dense dashboard UI** — analytics tables, charts, the inbox and the flow canvas
keep the comic identity (ink borders, halftone, sticker buttons, bold type) but
drop the loud overlays so the data stays readable. This split is deliberate;
don't "fix" it by making the flow builder louder.
