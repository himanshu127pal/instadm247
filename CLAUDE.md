# InstaDM247 — Project Memory

> **READ THIS FIRST in every session.** This file plus `docs/` is the single source of
> truth for what this product is, what is built, and what is intentionally deferred.
> Do not re-derive requirements from scratch and do not invent features that are not
> listed here. If you add or change scope, update `docs/FEATURES.md` in the same commit.

## What this is

A **Meta Tech Provider** SaaS web app that lets Instagram creators and brands connect
their Instagram professional account and build **automation flows** to handle their
customers — comment-to-DM, story replies, story mentions, IG Live comments, DM keyword
replies, AI answering, lead capture, broadcasts, analytics.

**Non-negotiable constraint: 100% official Meta APIs.** No scraping, no unofficial
endpoints, no session-cookie automation, no engagement-pod behaviour. The entire value
proposition is "creators don't get banned". Every outbound action must map to a
documented Graph API / Instagram Platform endpoint, must respect the messaging window,
and must respect published rate limits. See `docs/META_API.md`.

## Competitors we are matching in Phase 1

- **LinkDM** — https://www.linkdm.com/
- **SendDM** — https://senddm.ai/

`docs/FEATURES.md` holds the feature-by-feature matrix and the authoritative Phase 1 /
Phase 2 split. **Phase 1 = the union of both competitors' features.** Phase 2 is
explicitly out of scope for now.

**The competitor lists in `docs/FEATURES.md` §A and §B came from the owner, copied from
the competitors' own sites.** They are authoritative — don't re-research them, don't
drop items from them, and don't "helpfully" add features that aren't on them.

## Key product decisions already made (do not re-litigate)

| Decision | Choice | Why |
|---|---|---|
| Meta auth path | **Instagram API with Instagram Login** (Business Login) | No Facebook Page required — creators connect IG directly. Facebook Login path kept as an adapter seam but not the default. |
| Meta App ID/Secret | **Supplied at deploy time via env** | Owner adds them on the server. App must boot and the whole UI must work without them; only live IG calls degrade. |
| Pricing / plans | **Free / Pro / Business via Dodo Payments** (merchant of record), inert behind `BILLING_ENABLED` | Owner-approved. Priced against LinkDM; safety is free on every plan. Full design, and Dodo's verified API, in `docs/BILLING.md` — read it before touching billing. |
| Stack | Next.js 15 App Router + TypeScript, Postgres + Prisma, Redis + BullMQ, Tailwind v4 | Single deployable repo, real durable queue for delayed flow steps. |
| Flow builder | `@xyflow/react` (React Flow) node graph | Matches "automation flows" as the core primitive. |
| Visual design | **Comic / cartoon** — ink outlines, halftone, burst hovers | Owner's choice. Full intensity on marketing + auth; deliberately restrained in dense dashboard UI (tables, charts, flow canvas) so data stays readable. Don't "fix" that split. |
| Landing page | Heavily animated, interactive, custom | Owner explicitly rejected "plain AI generated" look. |
| Logo | **Owner's own files** in `public/brand/`, rendered by `src/components/brand/logo.tsx` | Do not replace them or redraw the mark. They are auto-traced vectors with real constraints — see `docs/ROADMAP.md` §Brand before touching them. |
| Platform admin | `/admin`, gated by `PLATFORM_ADMIN_EMAILS` / `PLATFORM_SUPPORT_EMAILS` | Staff tooling, separate from workspace roles. Env-var gated so revoking access is a deploy, not a database edit. |
| Webhook delivery log | `/admin/webhooks`, staff only; reading a raw payload is audited | Payloads carry a follower's message text and scoped ID — the customer's data about a third party. Metadata is browsable; the payload is a deliberate, logged click. |
| Meta app setup UI | `/admin/meta` only — never the customer dashboard | One Tech Provider app, owned by us. Its callback URLs, scopes and **verify token** are ours; the token is a shared secret. |
| Facebook channel | **Deferred** | Owner's decision. Needs Facebook Login, Page tokens, `pages_messaging` and a second App Review. The adapter seam in `src/lib/meta/` stays. |

## Architecture in one paragraph

Instagram sends webhooks → `/api/webhooks/instagram` verifies the `X-Hub-Signature-256`
and enqueues raw events → the **trigger matcher** resolves which `Automation` (and thus
which `Flow`) an event activates → the **flow engine** walks the node graph, executing
send/delay/condition/AI/capture nodes → delayed steps and all outbound sends go through
**BullMQ** queues that enforce per-account rate limits, the messaging window, and Slow
Down mode. Full detail in `docs/ARCHITECTURE.md`.

## Repo layout

```
docs/                  Memory + specs (FEATURES, ARCHITECTURE, META_API, SETUP, ROADMAP, BILLING, EMAIL, INTEGRATIONS, HELPER, SCHEDULER, SUPPORT, ONBOARDING, TRUST)
prisma/schema.prisma   All domain models
src/app/(marketing)/   Public landing site
src/app/(auth)/        Login / signup
src/app/(app)/         Authenticated dashboard
src/app/api/           Route handlers (auth, oauth, webhooks, REST for dashboard)
src/lib/meta/          Graph client, OAuth, webhook parsing, message sending
src/lib/engine/        Trigger matching, node executor, queues, rate limiter, window guard
src/lib/ai/            AI agent + knowledge base retrieval
src/lib/helper/        AI Helper: product guide, read-only tools, draft automations
src/lib/email/         SES sending, templates, verification/reset tokens, notifications
src/lib/billing/       Plans, metering, plan resolution, Dodo, payment trace
src/lib/media/         Scheduler uploads: Instagram media rules, storage, sweep
src/components/        UI (marketing/, dashboard/, flow/, ui/)
src/content/           Public content: feature pages, comparisons, blog posts
src/worker/            BullMQ worker process entrypoint
```

## Branches

`main` is the trunk and is what the production server tracks. Do work on a
short-lived branch and open a pull request into `main` — don't commit to `main`
directly, and don't let a working branch become a second trunk.

## Hard rules for anyone (human or agent) touching this code

1. **Never** add a code path that calls a non-public/undocumented Instagram endpoint.
2. **Never** send an outbound message except through `src/lib/engine/dispatch.ts` — it is
   the only place that enforces the window, rate limits, dedupe and Slow Down mode.
3. A private reply to a comment may be sent **once per comment id**, and only within
   7 days (during the broadcast only, for Live). This is enforced in the dispatcher and
   must stay enforced.
4. The `HUMAN_AGENT` tag is only ever attached to messages a human actually typed in the
   Inbox. Never attach it to automation output — Meta detects and penalises this.
5. Access tokens are encrypted at rest (`src/lib/crypto.ts`). Never log a token.
6. Keep `docs/FEATURES.md` truthful — it is the checklist the owner reviews against.
7. Schema changes go through `prisma migrate dev --name …` and the generated
   folder is committed with the code. **Never** run `prisma db push` against a
   database holding real data — it reshapes the schema with no record and no
   review step. `prisma/migrations/0_init` is the baseline.
8. The customer dashboard never names our infrastructure — no env var names, no
   Meta app callback URLs, no verify token, no "this server" framing. When
   something of ours is down, a customer sees that it is ours to fix; the detail
   goes to the server log and to `/admin/meta`. `pnpm e2e` scans the
   customer-facing tree for these strings and fails if one reappears.
9. A support session opened by impersonation is **read-only for anything
   outbound**, and a **suspended workspace cannot send at all**. Both are
   enforced in `dispatch.ts`, not in the UI, and both are covered by `pnpm e2e`.
   Suspension in particular must stop traffic leaving on Meta's API under our
   app — locking someone out of the dashboard is not the same thing.
10. **Safety is never a paid feature.** No plan gate may touch the messaging
   window, rate limits, per-comment dedupe, Slow Down or viral protection. And a
   human's reply typed in the Inbox is **never metered and never blocked** by a
   plan. Plans gate what a customer builds, not whether their account is safe or
   whether they can answer their own customer.
11. **Every payment webhook hit is recorded** in `PaymentEvent` — forged,
   duplicate, failed or ignored — and an admin override can only ever *raise* a
   customer's plan, never lower what they pay for.

12. **Nothing that can sign someone in is queued or stored.** Verification and
   password-reset emails are sent in the request; their log row keeps no inputs
   and tokens are stored only as hashes. Every other automatic email has a
   dedupe key, and an email failure never fails the action that caused it.
   See `docs/EMAIL.md`.

13. **Public content says only what's true.** Feature pages (`src/content/features.ts`)
   describe only what's built — change them in the same PR as the feature.
   Comparison pages (`src/content/compare.ts`) give a competitor ✓ only for what
   their own published list shows, "Not listed" otherwise (never ✗), carry an
   "as of" date, and say where they're ahead. Blog posts describe Instagram's
   rules as `dispatch.ts` enforces them. `pnpm e2e` checks links and the sitemap.
   **No em dashes (—) in anything people read**: pages, tab titles, emails, DMs,
   error messages, the AI Helper's guide. Owner's call: they read as machine-written.
   Use a comma, colon, brackets or a new sentence. Code comments are fine;
   `pnpm e2e` fails on one in text.

14. **The AI Helper's guide is part of the UI.** `src/lib/helper/guide.ts` is
   everything the helper knows about the product. A PR that renames a page,
   button or field, or changes what a feature does, updates the guide in the
   same PR. The helper's tools are read-only and never return a follower's
   messages or username; it may only *propose* an automation, which a person
   creates switched off. See `docs/HELPER.md`.

15. **The AI Helper can never cost more than 10% of what a customer pays, or $1
   a month for anyone who pays nothing.** Every model call reserves its
   worst-case cost against that monthly cap before it's made, and isn't made if
   the cap can't cover it. Don't add retries, fallbacks, models without a price,
   or unbounded input to the helper — each would break the guarantee. The cap
   comes from `helperBudgetMicros` in `plans.ts`. See `docs/HELPER.md` §The cap.

## Plans and billing

The price list is `src/lib/billing/plans.ts`; the only place that decides what a
workspace may do is `src/lib/plan.ts`. No feature code hardcodes a limit or reads
`planKey` to make a decision. `Workspace.planKey` is the *resolved* plan, written
only by `src/lib/billing/resolve.ts`. Everything Dodo-specific is in
`src/lib/billing/dodo.ts` and the webhook. See `docs/BILLING.md`.

## Current status

See `docs/ROADMAP.md` for the live build checklist. Phase 1 scope is defined and
implemented; Phase 2 items are listed but **not** started.
