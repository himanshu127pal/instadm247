# Architecture

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, custom design tokens, dark + light |
| Motion | `motion` (Framer Motion v11 successor) for the app, custom canvas/SVG work on the landing page |
| Flow builder | `@xyflow/react` |
| Charts | `recharts` |
| DB | PostgreSQL via Prisma |
| Queue / cache / rate limiting | Redis + BullMQ |
| Validation | Zod, shared between client and server |
| Auth | Session cookies (JOSE-signed JWT), Argon2id password hashing |
| Worker | Separate Node process (`src/worker/index.ts`) running BullMQ workers |

Single repo, two runtime processes: the Next.js server and the worker. Both share
`src/lib`.

## Request → automation lifecycle

```
Instagram
   │  webhook POST (comments | live_comments | messages | messaging_postbacks | ...)
   ▼
/api/webhooks/instagram
   │  1. verify X-Hub-Signature-256 against raw body (constant time)
   │  2. persist WebhookEvent (idempotency key = provider event id)
   │  3. return 200 immediately  ← Meta requires a fast ack
   │  4. enqueue "ingest" job
   ▼
ingest worker  (src/lib/engine/ingest.ts)
   │  normalise the payload into a canonical TriggerEvent
   │  upsert Contact + Conversation, refresh the 24h window
   ▼
trigger matcher  (src/lib/engine/match.ts)
   │  find Automations for (account, trigger type, media scope, keywords)
   │  respect: enabled, schedule, per-contact re-entry rules, suppression list
   ▼
flow engine  (src/lib/engine/run.ts)
   │  create FlowRun, walk nodes from the trigger node
   │  sync nodes execute inline; DELAY schedules a resume job
   ▼
dispatcher  (src/lib/engine/dispatch.ts)   ← the ONLY outbound path
   │  window guard · per-comment dedupe · rate limiter · Slow Down mode
   │  · suppression check · retry/backoff · dead-letter
   ▼
Instagram Graph API
```

## Why a durable queue

Flows have delays of up to 24 hours and broadcasts fan out to thousands of contacts.
In-memory timers would lose work on deploy. BullMQ gives delayed jobs, retries with
backoff, concurrency caps and a dead-letter queue, and Redis doubles as the token-bucket
store for per-account rate limits.

Queues:

| Queue | Purpose |
|---|---|
| `ingest` | Normalise + match webhook events |
| `flow` | Execute / resume flow runs (delayed jobs live here) |
| `dispatch` | Outbound Instagram API sends, rate limited per account |
| `broadcast` | Fan-out of broadcast + smart re-engage campaigns |
| `maintenance` | Token refresh, window sweeps, analytics rollups, planner scanning |

## Data model (see `prisma/schema.prisma` for the truth)

```
User ─┬─ Workspace ─┬─ InstagramAccount ─┬─ Automation ── Flow (nodes/edges JSON)
      │             │                    ├─ Contact ── Conversation ── Message
      │             │                    ├─ IceBreaker / PersistentMenu
      │             │                    └─ AccountHealth / RateLimitState
      │             ├─ Template, TrackedLink, LeadForm ── LeadResponse
      │             ├─ Broadcast, PlannedAutomation, Segment
      │             └─ AiAgent ── KnowledgeDoc
      └─ Session
FlowRun ── FlowRunStep        (execution history, powers funnel analytics)
WebhookEvent                  (raw audit + idempotency)
AnalyticsEvent                (append-only, rolled up into DailyStat)
SuppressionEntry              (opt-outs)
```

### Flow graph storage

A `Flow` stores `nodes` and `edges` as JSON validated by a Zod schema
(`src/lib/engine/schema.ts`). Node types are a discriminated union on `type`, so adding a
node means: extend the union, add an executor in `src/lib/engine/nodes/`, add a UI card in
`src/components/flow/nodes/`. Nothing else changes.

### Node executor contract

```ts
type NodeExecutor = (ctx: RunContext, node: FlowNode) => Promise<NodeResult>
// NodeResult = { next: nodeId | null } | { wait: { resumeAt, nodeId } } | { halt: reason }
```

`RunContext` carries the account, contact, conversation, trigger event, collected
variables and a dispatcher handle. Executors never call Instagram directly.

## Safety subsystem

Everything that keeps accounts un-banned lives in `src/lib/engine/guards/`:

- `window.ts` — 24-hour window bookkeeping and pre-send validation
- `dedupe.ts` — one private reply per comment id, replay-safe
- `ratelimit.ts` — Redis token bucket per account + endpoint class
- `slowdown.ts` — 2-hour throttle, auto-armed on 429/613 responses
- `suppression.ts` — STOP keywords, manual blocks, deauthorized contacts
- `policy.ts` — reacts to `messaging_policy_enforcement` webhooks, pauses automations

The Safety Center page in the dashboard reads directly from these so the user can see
exactly why a message was or wasn't sent.

## Analytics

Every meaningful action appends an `AnalyticsEvent` (trigger fired, message sent,
delivered, seen, link clicked, follow gained, form completed, flow node entered/exited).
A `maintenance` job rolls them into `DailyStat` per automation/account every 15
minutes, recounting whole UTC days. Dashboards read days before yesterday from
`DailyStat` and yesterday and today straight from the events (`getStatRows` in
`src/lib/queries.ts`), so a run counts the moment it happens. Funnel and drop-off
come from `FlowRunStep`.

Clicks: Instagram reports reads (`messaging_seen`) but never link taps. Every
link button an automation sends goes out as `/go/<token>`
(`src/lib/engine/links.ts`): the token is the destination, run and step,
HMAC-signed, so it can't be turned into an open redirect. The redirect counts
one `link_clicked` per run and step against the automation, skipping link
previewers, then 302s. Reads are counted once per message, against the
automation whose run sent it. Hand-made tracked links in Templates still use
`/r/[code]`.

## Security

- Access tokens encrypted with AES-256-GCM (`src/lib/crypto.ts`), key from `ENCRYPTION_KEY`.
- Webhook signature verification on the raw body, constant-time compare.
- All dashboard API routes go through `requireWorkspace()` which scopes every query.
- CSRF via `state` on OAuth and SameSite=Lax session cookies.
- No token, secret or full webhook body is ever logged at info level.

## Configuration

The app boots and the entire UI works with **no Meta credentials**. `src/lib/env.ts`
validates config and marks Instagram integration `configured: false` when `META_APP_ID` /
`META_APP_SECRET` are absent; the Connect button then explains what's missing instead of
throwing. Demo mode seeds realistic data so the dashboard is explorable pre-credentials.
