# Roadmap / build status

Live checklist. Update this in the same commit as the code — `docs/FEATURES.md`
holds the researched competitor matrix, this holds what actually exists.

## Phase 1 — built

### Foundation
- [x] Next.js 15 App Router + TypeScript, Tailwind v4 design system, light/dark
- [x] Postgres + Prisma schema (28 models)
- [x] Redis + BullMQ (5 queues) with a separate worker process
- [x] Email/password auth, workspaces, session cookies
- [x] Boots and is fully explorable with **no** Meta credentials

### Instagram integration
- [x] Business Login for Instagram OAuth (no Facebook Page needed)
- [x] Long-lived token exchange + daily refresh job
- [x] Graph client: profile, media, user profile, conversations, messages
- [x] Webhook receiver with `X-Hub-Signature-256` verification and idempotency
- [x] Deauthorize + data-deletion callbacks
- [x] Ice breakers and persistent menu published to Instagram
- [x] Multiple Instagram accounts per workspace

### Triggers
- [x] Comment on post / Reel
- [x] Comment on ad or boosted post (captures `ad_id` / `ad_title`)
- [x] Instagram Live comment
- [x] Story reply
- [x] Story @mention
- [x] Inbound DM keyword
- [x] Conversation starter (ice breaker) tapped
- [x] Button postback
- [x] `ig.me` referral
- [x] Scopes: specific posts / all posts / universal / ads only

### Keyword matching
- [x] All-messages mode and keyword mode
- [x] Contains (whole-word) / exact / starts-with / regex
- [x] Negative keywords that veto even in all-messages mode
- [x] Case, accent and emoji insensitive
- [x] Optional typo tolerance, disabled for short keywords

### Flow engine
- [x] Visual builder (React Flow) with 15 step types
- [x] Send text / image / video / audio / buttons / 10-slide carousel
- [x] Public comment reply (rotating variants)
- [x] Delay, condition, randomiser, tag, set field, HTTP request
- [x] Follower check and ask-for-follow gate
- [x] Collect input (lead forms, surveys, quizzes)
- [x] AI reply with knowledge-base grounding
- [x] Human handoff
- [x] Live graph validation against the 24h window
- [x] Five starter presets
- [x] Funnel analytics per node

### Safety
- [x] 24-hour messaging window tracked per contact and enforced at send time
- [x] One private reply per comment, claimed atomically (concurrency-safe)
- [x] 7-day private-reply deadline; Live only during the broadcast
- [x] Per-account hourly rate limits via Redis
- [x] Slow Down mode — manual, and auto-armed on throttling, 2h expiry
- [x] `HUMAN_AGENT` restricted to messages a human typed
- [x] STOP / opt-out suppression
- [x] Policy-enforcement webhooks pause the account
- [x] Safety Center showing every skip with a plain-language reason

### Product surfaces
- [x] Dashboard overview with activity charts
- [x] Automations list, creation wizard, builder
- [x] Unified inbox with human takeover
- [x] Contacts CRM with tags, fields, filters, CSV + XLSX export
- [x] Lead forms with CSV + XLSX response export
- [x] Broadcasts with eligibility preview
- [x] Smart re-engagement (recurring)
- [x] DM Planner with caption draft codes
- [x] Templates, tracked links, conversation starters
- [x] AI agent with knowledge base and guardrails
- [x] Analytics: per-automation table, link clicks, funnels
- [x] Interactive marketing site + legal pages

### Verification
- [x] `pnpm typecheck` and `pnpm build` clean
- [x] `pnpm e2e` — 66 checks against a live database, all passing
- [x] Every route smoke-tested authenticated and unauthenticated

## Phase 2 — not started

Do not build these without the owner asking. See `docs/FEATURES.md` §D.

- [ ] Pricing, plans and quota enforcement (seam exists in `src/lib/plan.ts`)
- [ ] Team seats, roles and permissions
- [ ] WhatsApp / Messenger / TikTok channels
- [ ] Catalogue and checkout inside the DM
- [ ] Zapier / Make / CRM integrations
- [ ] White-label and agency multi-client mode
- [ ] A/B testing with statistical significance
- [ ] Public API + customer-facing webhooks
- [ ] Mobile app

## Known gaps worth knowing about

- **Prisma migrations** — the schema is applied with `db:push`. Generate a real
  migration history before the first production deploy.
- **Legal pages** carry bracketed placeholders (`[your support email]`,
  `[your legal entity and address]`) that must be filled in before App Review.
- **Live-comment window** — "is the broadcast still running" is approximated at
  15 minutes since the API doesn't expose it directly. A rejected send is
  recorded as a skip, not an error, so the worst case is a missed DM.
- **AI retrieval** is keyword-overlap, not embeddings. Fine at FAQ scale; revisit
  if a knowledge base grows past a few hundred articles.
