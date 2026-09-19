# Roadmap / build status

Live checklist. Update this in the same commit as the code — `docs/FEATURES.md`
holds the researched competitor matrix, this holds what actually exists.

## Phase 1 — built

### Foundation
- [x] Next.js 15 App Router + TypeScript, Tailwind v4 design system, light/dark
- [x] Postgres + Prisma schema (42 models)
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
- [x] Visual builder (React Flow) with 16 step types
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

### Competitor-parity features added in the second pass
- [x] **Rewind** — backsend DMs to still-eligible past comments, with a preview
      that explains every exclusion
- [x] **DM Coupons** — shared and unique code pools, one code per person,
      atomic issuance, "ran out" branch
- [x] **Link in Bio** — hosted `/l/[slug]` page, five themes, per-block click
      tracking, badge toggle
- [x] **Schedule & Auto-Post** — container-based publishing with status polling,
      carousels, and automations that switch on at publish
- [x] **Next Post** — attach an automation to whatever publishes next, no code
- [x] **DM Main Menu** — persistent menu manager, up to 20 items
- [x] **Viral Post Protection** — proactive spike detection arms Slow Down
      before Instagram throttles
- [x] **WhatsApp / email redirect presets** in the message editor
- [x] **Kit + Flodesk integrations** — verified on save, leads forwarded
      automatically
- [x] **Public API** — scoped keys (hash-stored), `/api/v1/contacts`,
      `/api/v1/send`, outbound webhook endpoints

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
- [x] `pnpm e2e` — 85 checks against a live database, all passing
- [x] Every route smoke-tested authenticated and unauthenticated
- [x] Every page loaded in a real browser and checked for client-side errors

## Design

Comic/cartoon system, chosen by the owner. Full intensity on marketing and
auth; restrained in dense dashboard UI. See `docs/FEATURES.md` §F — the split is
deliberate.

### Brand

**These are the owner's own files.** They live in `public/brand/` and
`src/components/brand/logo.tsx` renders them:

| File | Used for |
|---|---|
| `mark.png` | `LogoMark` — the ring alone, for tight spaces and the bio badge |
| `logo-lockup.png` | the lockup, light themes |
| `logo-lockup-dark.png` | the lockup, dark themes |

They replaced an auto-traced SVG set that looked poor at size — tracing turned
smooth gradients into faceted path soup. PNG is the right format for this
artwork; don't re-vectorise it.

Four things worth not undoing:

1. **They are processed, not raw.** As supplied, `mark.png` was 4.8MB at
   2048×2048 with a white background baked in, and the lockups carried ~50%
   transparent padding. They ship de-backgrounded, trimmed to content, sized for
   3× the largest on-page use (36px) and palette-encoded: **9KB + 17KB + 17KB**.
   Regenerate from the originals rather than editing these in place.
2. **The mark's white background was converted to alpha**, so it sits correctly
   on the nav, the cream footer, dark mode and any colour a customer picks for
   their link-in-bio page. Naive white-removal leaves either a pale halo or
   semi-transparent saturated colour; the conversion clamps near-white to fully
   transparent and un-blends edge pixels from white. It also drops a very faint
   drop shadow baked under the artwork, which is what makes the mark square.
3. **The lockup ships twice**, because its wordmark ink is a dark slate that
   disappears on a dark ground and a flat image cannot be recoloured by CSS. The
   swap is the `.theme-light-only` / `.theme-dark-only` pair in `globals.css`,
   and it has to be CSS: the theme lives in localStorage and is applied before
   paint, so choosing during render would mean a hydration mismatch or a flash
   of the wrong logo.
4. **The favicon adds a paper-white disc** behind the mark, because the mark is
   transparent and its plane is dark — without it the plane vanishes into dark
   browser chrome. Check any change at 16/24/32/64px against *both* light and
   dark chrome; that is the only way this class of error shows up.

Derived assets are wired up by Next's file conventions — `src/app/icon.png`,
`apple-icon.png`, `opengraph-image.png`, `twitter-image.png`. Regenerate all
four from the originals if the artwork ever changes.

## Platform admin (`/admin`)

**`/admin/meta`** holds the Meta app setup — OAuth redirect, webhook callback,
deauthorize and data-deletion URLs, Graph API version, required scopes, webhook
fields, and the platform health checks. These lived on the customer dashboard
(`/dashboard/accounts` and `/dashboard/settings`) until they were moved here.
That was a leftover from when the app was something one person self-hosted with
their own Meta app; under the Tech Provider model there is one app and we own
it. The webhook verify token in particular is a shared secret and was being sent
to every signed-in customer's browser. The token is additionally restricted to
`role === "admin"` — support staff have no use for it.

Staff tooling, deliberately separate from workspace membership. Access is
granted by listing an email in `PLATFORM_ADMIN_EMAILS` or
`PLATFORM_SUPPORT_EMAILS` — there is no invite flow, so granting and revoking
are both deploys, which is the right shape for a role that can read every
customer's messages. `support` can read, impersonate and leave notes; `admin`
adds suspend and unsuspend.

Built:

- **Overview** — customers, users, accounts, suspended, sent/failed in 24h,
  accounts needing a reconnect, automations paused
- **Highest-volume accounts, 24h** — see below
- **Customers** — searchable by workspace, owner email or @username; per-row
  account count, contacts, 30-day sends, plan, status
- **Customer detail** — accounts with token status, members, a 30-day breakdown
  of *why* sends were skipped, internal notes
- **Suspend / unsuspend** with a customer-visible reason
- **Sign in as** (impersonation) with a required reason
- **Audit log** — every privileged action

Three things that are load-bearing rather than decorative:

1. **Suspension is enforced in `dispatch.ts`.** Blocking sign-in would leave the
   automations running; the point of suspending is that traffic stops leaving on
   Meta's API under our app. There is deliberately no exception for `source:
   "human"`. Suspending also drops the customer's sessions so they see the
   notice immediately.
2. **Impersonated sessions cannot send.** An Inbox reply carries Meta's
   `HUMAN_AGENT` tag, which asserts a human wrote it — and that human would not
   be the account owner. Sessions also expire in an hour rather than thirty days,
   and platform staff cannot be impersonated at all, which would otherwise let
   one staff account borrow another's and muddy the audit trail.
3. **The highest-volume view protects the business, not the customer.** Meta
   grades a Tech Provider's app as a whole, so one customer blasting DMs can get
   *every* customer's integration restricted. Worth a daily glance.

Covered by `pnpm e2e` (5 checks): suspension blocks automation and human sends,
lifting it restores sending, and an impersonated session is refused.

### Worth adding when there's a reason to

Ordered by how often the absence will actually hurt:

- **Queue and worker health** — BullMQ depth, failed jobs, worker heartbeat. If
  the worker dies, delayed steps stop silently; nothing currently notices.
- **Cross-customer failure explorer** — group send failures by Meta error code.
  A new code appearing across many customers at once is an API change, and
  that is the fastest way to find out.
- **Plan and quota management** — once pricing lands: change a plan, grant an
  override without a deploy. Hooks into `src/lib/plan.ts`.
- **Announcement banner** — one message pushed to every dashboard, for incidents
  and maintenance.
- **GDPR/export tooling** — fulfil an access or deletion request without SQL.
- **Impersonation review** — a weekly digest of who viewed what. The log exists;
  nobody reads logs unprompted.
- **Signup funnel** — signups that never connected an account, to see where
  onboarding loses people.

## Phase 2 — not started

Do not build these without the owner asking. See `docs/FEATURES.md` §D.

- [ ] Pricing, plans and quota enforcement (seam exists in `src/lib/plan.ts`)
- [ ] Team seats, roles and permissions
- [ ] Facebook AutoDM (deferred by the owner — needs Facebook Login, Page
      tokens and a second App Review)
- [ ] WhatsApp / Messenger / TikTok channels
- [ ] Catalogue and checkout inside the DM
- [ ] Zapier / Make / CRM integrations
- [ ] White-label and agency multi-client mode
- [ ] A/B testing with statistical significance
- [ ] Mobile app

### Fonts are self-hosted on purpose

`src/app/layout.tsx` uses `next/font/local` against woff2 files in
`src/app/fonts/`, not `next/font/google`. The Google loader downloads at *build*
time, which makes every build — CI and the server's release step alike — depend
on reaching fonts.googleapis.com. That failed a CI run once; a deploy that can
break because someone else's CDN blipped is not a deploy. All three faces are
OFL licensed, so shipping the files is fine. Don't switch back.

## Known gaps worth knowing about

- **Prisma migrations** — `prisma/migrations/0_init` is the baseline, generated
  from the schema and verified to reproduce it with no drift. CI applies the
  full history on every PR, so a broken migration fails there. Change the schema
  with `prisma migrate dev --name …` and commit the generated folder; never
  `db push` against a database with real data in it. A server first deployed
  before migrations existed needs a one-time
  `prisma migrate resolve --applied 0_init` — see `docs/DEPLOY.md`.
- **Legal pages** are filled in with the real entity (InstaDM247 / Rajat Pal,
  `support@instadm247.com`). They deliberately carry **no governing-law or
  dispute clause** — the owner chose to skip it. Add one before selling into
  jurisdictions that expect it.
- **Live-comment window** — "is the broadcast still running" is approximated at
  15 minutes since the API doesn't expose it directly. A rejected send is
  recorded as a skip, not an error, so the worst case is a missed DM.
- **AI retrieval** is keyword-overlap, not embeddings. Fine at FAQ scale; revisit
  if a knowledge base grows past a few hundred articles.
- **Outbound customer webhooks** deliver inline rather than through a retry
  queue: a failing endpoint is recorded and disabled after 20 consecutive
  failures, but individual deliveries are not retried.
- **Publishing needs a reconnect.** `instagram_business_content_publish` was
  added to the requested scopes; accounts connected before that must reconnect
  before the scheduler works. The Scheduler page detects this and says so.
- **Kit / Flodesk target pickers** take an ID by hand rather than listing forms
  and segments from the provider.

### Brand assets are a redraw, not the owner's files

`src/components/brand/logo.tsx` and `src/app/icon.svg` are an SVG reconstruction
of the owner's supplied artwork, matched by eye. If the original vector files
ever land in the repo, prefer them — see the "Replacing the logo" note in
`docs/DEPLOY.md`.
