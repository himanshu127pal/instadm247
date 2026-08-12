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

`docs/FEATURES.md` holds the researched feature-by-feature matrix and the authoritative
Phase 1 / Phase 2 split. **Phase 1 = the union of both competitors' features.** Phase 2
is explicitly out of scope for now.

## Key product decisions already made (do not re-litigate)

| Decision | Choice | Why |
|---|---|---|
| Meta auth path | **Instagram API with Instagram Login** (Business Login) | No Facebook Page required — creators connect IG directly. Facebook Login path kept as an adapter seam but not the default. |
| Meta App ID/Secret | **Supplied at deploy time via env** | Owner adds them on the server. App must boot and the whole UI must work without them; only live IG calls degrade. |
| Pricing / plans | **Deliberately NOT implemented yet** | Owner's instruction: build every feature unplanned/ungated first. A `Plan` seam exists in the schema but nothing is enforced. See "Plan gating seam" below. |
| Stack | Next.js 15 App Router + TypeScript, Postgres + Prisma, Redis + BullMQ, Tailwind v4 | Single deployable repo, real durable queue for delayed flow steps. |
| Flow builder | `@xyflow/react` (React Flow) node graph | Matches "automation flows" as the core primitive. |
| Landing page | Heavily animated, interactive, custom | Owner explicitly rejected "plain AI generated" look. |

## Architecture in one paragraph

Instagram sends webhooks → `/api/webhooks/instagram` verifies the `X-Hub-Signature-256`
and enqueues raw events → the **trigger matcher** resolves which `Automation` (and thus
which `Flow`) an event activates → the **flow engine** walks the node graph, executing
send/delay/condition/AI/capture nodes → delayed steps and all outbound sends go through
**BullMQ** queues that enforce per-account rate limits, the messaging window, and Slow
Down mode. Full detail in `docs/ARCHITECTURE.md`.

## Repo layout

```
docs/                  Memory + specs (FEATURES, ARCHITECTURE, META_API, SETUP, ROADMAP)
prisma/schema.prisma   All domain models
src/app/(marketing)/   Public landing site
src/app/(auth)/        Login / signup
src/app/(app)/         Authenticated dashboard
src/app/api/           Route handlers (auth, oauth, webhooks, REST for dashboard)
src/lib/meta/          Graph client, OAuth, webhook parsing, message sending
src/lib/engine/        Trigger matching, node executor, queues, rate limiter, window guard
src/lib/ai/            AI agent + knowledge base retrieval
src/components/        UI (marketing/, dashboard/, flow/, ui/)
src/worker/            BullMQ worker process entrypoint
```

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

## Plan gating seam (Phase 1: intentionally inert)

`Workspace.planKey` exists and defaults to `unlimited`. `src/lib/plan.ts` exposes
`getLimits(workspace)` which currently returns `Infinity` for every quota. When pricing
lands, only that file and the `Plan` table need to change — no feature code should ever
hardcode a limit.

## Current status

See `docs/ROADMAP.md` for the live build checklist. Phase 1 scope is defined and
implemented; Phase 2 items are listed but **not** started.
