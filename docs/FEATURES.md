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
| 8 | **Click Analytics** | Track link click analytics on DMs sent | Done | Tracked links + `/r/[code]` |
| 9 | **Flow Automation** | Sequence of DMs and reminders after engagement | Done | Visual flow builder |
| 10 | **Comment Auto-Reply** | Reply to the comment publicly once a DM is sent | Done | `REPLY_TO_COMMENT` node |
| 11 | **White Label** | Remove LinkDM branding from DMs sent | **N/A** | We never brand outbound DMs. Applies only to the Link-in-Bio badge, which is toggleable. |
| 12 | **Multiple Accounts** | Connect up to 3 Instagram accounts | Done | Unlimited in Phase 1 |
| 13 | **Increased DM Send Limit** | 25,000 DMs/account/month | **P2** | Plan gating — `src/lib/plan.ts` |
| 14 | **Universal Triggers** | Global triggers across multiple placements | Done | `scope: UNIVERSAL` |
| 15 | **Rewind** | Backsend DMs to eligible comments | Done | Rewind, per automation |
| 16 | **Advertising AutoDM** | Auto-reply to comments on sponsored content | Done | `AD_COMMENT` trigger |
| 17 | **Inbox Automation** | Auto-reply to inbox messages | Done | `DM_KEYWORD` trigger |
| 18 | **Referral Program** | Access our referral program and start earning | **N/A** | LinkDM's own affiliate scheme, not a creator-facing capability |
| 19 | **Lead Generation** | Capture email addresses directly in chat | Done | Lead forms + `COLLECT_INPUT` |
| 20 | **DM Planner** | Draft DMs for scheduled posts in advance | Done | Draft codes + scheduler linkage |
| 21 | **DM Templates** | Save and re-use DMs | Done | Template library |
| 22 | **DM Coupons** | Send coupons via DMs | Done | Coupon pools + `SEND_COUPON` node |
| 23 | **API Integrations** | Connect lead forms to Kit and Flodesk | Done | Native Kit + Flodesk, plus generic webhook |
| 24 | **DM Send Limit+** | 300,000 DMs/account/month | **P2** | Plan gating |
| 25 | **Accounts+** | Up to 10 Instagram accounts | **P2** | Unlimited already; the cap is a plan concern |
| 26 | **DM Queue** | Advance queue so a DM is never missed | Done | BullMQ dispatch queue + queue view in Safety Center |
| 27 | **Slow Down Mode** | Slow automations when Reels blow up | Done | Manual, auto-on-throttle, and proactive spike detection |

## B. SendDM — capabilities from their pricing page (owner-supplied)

Filtered to actual product capabilities; quotas and support tiers are marked.

| # | SendDM line item | Status | Where it lives |
|---|---|---|---|
| 1 | Unlimited **DM Send Limit** | **P2** (quota) | Unlimited today |
| 2 | 25,000/mo **AI Credits** | **P2** (quota) | AI is unmetered today |
| 3 | **Viral Post Protection** | Done | Proactive comment-spike detection → Slow Down |
| 4 | 20 **Instagram Accounts** | Done | Unlimited |
| 5 | **Comment Auto-Reply** | Done | |
| 6 | **Story Automation** | Done | |
| 7 | **Story Mention Auto-Reply** | Done | |
| 8 | Unlimited **Message Templates** | Done | |
| 9 | Advanced **Keyword Triggers** | Done | contains/exact/starts-with/regex, negatives, typo tolerance |
| 10 | **Analytics Dashboard** | Done | |
| 11 | **Contact Management** | Done | |
| 12 | **Contact Export** | Done | CSV + XLSX |
| 13 | **WhatsApp/Email Redirect** | Done | One-click presets in the message editor |
| 14 | **Priority Support** | **N/A** | Service tier, not software |
| 15 | **API Access** | Done | Scoped API keys + outbound webhooks |
| 16 | **Custom Integrations** | Done | `HTTP_REQUEST` node + outbound webhooks |
| 17 | **Dedicated Account Manager** | **N/A** | Service tier |
| 18 | **SLA Guarantee** | **N/A** | Contractual, not software |
| 19 | Unlimited **Schedule & Auto-Post** | Done | Content scheduler (`instagram_business_content_publish`) |
| 20 | 300MB **Large Video Uploads** | Done | Scheduler accepts video by URL; no artificial cap |
| 21 | 4 **Conversation Starters** | Done | Ice breakers (5 stored, 4 shown — Instagram's limit) |
| 22 | 20 items **DM Main Menu** | Done | Persistent menu manager |
| 23 | Unlimited **Link in Bio Page** | Done | Hosted at `/l/[slug]` |
| 24 | Full history **Link in Bio Analytics** | Done | Per-block click tracking |
| 25 | **Remove Link in Bio Badge** | Done | Toggle on the page (the only real white-label surface) |

---

## C. Deferred by explicit decision

### Facebook channel (LinkDM #3)
Owner decision, this session: **skip for now.** It requires the Facebook Login
path, Page access tokens, `pages_messaging`, a Page-shaped data model and a
second App Review track — a large parallel integration for one line item.
`src/lib/meta/` keeps the adapter seam. Revisit as a focused piece of work.

### Plan gating (LinkDM #13, #24, #25; SendDM #1, #2)
Owner's standing instruction: build every feature ungated first. `Workspace.planKey`
and `src/lib/plan.ts` are the only places that change when pricing lands. No
feature code may hardcode a quota.

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

---

## E. Phase 2 — do not build without being asked

- Pricing, plans, quota enforcement, billing
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
