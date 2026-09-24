# AI Helper

An assistant in the dashboard (`/dashboard/helper`, and the **Ask AI** button in
the top bar) for the **account owner** — not their followers. That's the AI
agent, a separate feature. Built on the owner's request.

## What it does

- **How-to answers.** "How do I schedule a post?" → numbered steps naming the
  real sidebar page, button and field labels, with links to the pages.
- **Plans for a goal.** "I want to sell my ebook" → which trigger, which
  template, what the DMs should say, and an offer to draft it.
- **Draft automations.** It proposes a ready-made automation as a card. The
  customer presses **Create draft**; it goes through the same
  `POST /api/automations` as the wizard and is created **switched off**, then
  opens in the builder. The customer's own words (first DM, button link, public
  replies) are applied on top of one of the existing templates.
- **Troubleshooting.** "Why didn't my automation send?" → it looks at that
  workspace's automations, their settings, flow errors, runs and skip reasons,
  and explains the cause and the fix.

## What it can't do — by design

- **Change anything.** Every tool is read-only. Drafting returns a card; the
  customer's click creates it, and it can't reach anyone until they turn it on.
- **See followers.** No tool returns a follower's messages, username or other
  data about a third party — only the customer's own setup and aggregate counts.
  `pnpm e2e` plants a follower's username and message text and checks no tool
  output contains either.
- **Cross workspaces.** The workspace id comes from the session, never from the
  model. Asking for another workspace's automation by id returns "not found".
- **Work in a support session.** Impersonated sessions get a 403. The helper
  spends the customer's questions and talks to a model on their behalf.
- **Suggest breaking Instagram's rules.** The prompt forbids workarounds (mass
  DMs, messaging people who haven't interacted, follow tricks). It explains the
  rule and offers the allowed alternative.

## How it knows the product

`src/lib/helper/guide.ts` — a hand-written guide, one section per page, using
the exact labels on screen. **It is the helper's only knowledge of the product,
so it's part of the UI:** a PR that renames a button or changes what a feature
does updates the guide in the same PR (CLAUDE.md rule 14). `pnpm e2e` checks
every page path in it exists and that it covers every sidebar page.

Plan limits are **not** in the guide. They come live from the workspace's plan
through `get_workspace_overview`, so they can't drift from `plans.ts`.

Writing the guide surfaced real gaps, now listed in `docs/ROADMAP.md` §Known
gaps. One was fixed here: an "Ask a question" step could not be linked to a lead
form, so no form response was ever recorded from a flow.

## Architecture

```
dashboard/helper page ──POST /api/helper──▶ route.ts
                                            │  plan gate (aiHelper), support-session block,
                                            │  reserve 1 "helper" question
                                            ▼
                                         run.ts  ── Anthropic Messages API (streamed)
                                            │        system: [HELPER_SYSTEM (cached) , page + date]
                                            │        tools:  tools.ts (read-only)
                                            ▼
                         NDJSON events: text · status · proposal · done · error
```

- `run.ts` — the manual tool loop (at most 6 rounds), streaming text deltas as
  they arrive, a status line while a tool runs, and draft cards.
- `tools.ts` — `get_workspace_overview`, `list_automations`, `get_automation`,
  `get_skipped_messages`, `draft_automation`.
- `draft.ts` — validates a draft with the same rules as the wizard and builder
  (plan gates, keyword/match-mode rules, a public reply only on comment
  triggers, `validateGraph`), and applies the customer's words to a template.
  `POST /api/automations` uses the same `buildDraftGraph`, so the card and the
  created automation can't differ.
- `helper-chat.tsx` — the chat. The conversation lives in the browser tab
  (`sessionStorage`) and is sent back with each question (last 20 turns); nothing
  is stored server-side. Answers render from a small markdown subset as React
  elements — never HTML — and links go only to `/dashboard/...` or `https://`.

## Model and cost

- Model: `AI_HELPER_MODEL`, default **`claude-sonnet-5`** (owner's choice: about
  2.5× more questions than Opus under the same cap), adaptive thinking at
  `medium` effort. The model must be in the price table in
  `src/lib/helper/pricing.ts`; **an unpriced model is never called** (the helper
  shows "temporarily unavailable" and logs why), because its cost can't be
  bounded.
- The system prompt and tools (~6k tokens) are the same for every customer and
  cached as one shared prefix. Per-request context goes after the breakpoint.
- No server-side refusal fallback and no SDK retries: either could bill a call
  we didn't reserve for, or bill a different model.

### The cap: worst case, enforced before every call

**Rule (owner's decision): the helper can never cost more than 10% of what the
customer pays, and never more than $1 a month for a customer who pays nothing.**
It's a hard cap, not an estimate.

| Plan | Monthly cap | Why |
|---|---|---|
| Free | $1.00 | owner-set flat cap for unpaid use |
| Pro | $1.58 | 10% of $190/year ÷ 12 (also under 10% of $19/month) |
| Business | $6.58 | 10% of $790/year ÷ 12 (also under 10% of $79/month) |
| Unlimited (staff, comps, pre-billing) | $1.00 | nobody pays for it |
| Anything while `BILLING_ENABLED` is off | $1.00 | nobody's paying yet |

Computed in `helperBudgetMicros` (`plans.ts`) from the plan's prices, so it
follows any price change. Spend is recorded in `UsageCounter` as metric
`helper_spend`, in micro-dollars, per calendar month.

How it's enforced (`run.ts`, `pricing.ts`, `usage.ts`):

1. **Before every model call**, the most that call could cost is reserved:
   every input token priced as a cache write (the dearest way an input token is
   billed), input tokens bounded by the request's UTF-8 size (a token always
   covers at least one byte, whatever the language), plus earlier rounds' output
   (their thinking comes back as input), plus a fixed overhead; and output at
   `max_tokens`. The reservation is one atomic `UPDATE … WHERE count + amount <=
   cap`, so racing questions can't overshoot either.
2. **If the cap can't cover that worst case, the call isn't made.** Before the
   first call, the customer sees "You've reached this month's AI Helper
   allowance"; between calls, the answer stops and says why.
3. **After a call**, the API's own usage report sets what it really cost, and the
   rest of the reservation is given back.
4. **A call that fails part-way keeps its whole reservation** (it may have been
   billed for anything up to it). A call the API rejected with an HTTP error
   costs nothing and is released.
5. Each question is also limited to 4 calls of at most 4,096 output tokens, 8
   turns of history of 2,000 characters, and tool results of 8,000 characters —
   which keeps each call's worst case, and therefore the reservation, small.

What that means in questions (estimates; the cap itself is exact). On
`claude-sonnet-5` ($2 / $10 per million tokens) a typical question costs about
$0.01–0.025, and a question can only start while roughly $0.06–0.10 of the
month is left, because that's its first call's worst case:

| Plan | Weekly limit | Likely questions / month on `claude-sonnet-5` (default) | On `claude-opus-5` |
|---|---|---|---|
| Free | 5 | ~22 (weekly limit) | ~15–22 |
| Pro | 20 | ~60–87 | ~25–45 |
| Business | 50 | ~217 (weekly limit) | ~120–210 |

If every question were as expensive as the rules allow, far fewer would fit —
but the cap would still hold. The weekly limit spreads use through the month;
the money cap is what guarantees the cost. Switching to `claude-opus-5`
($5 / $25) gives more careful answers and about 2.5× fewer questions under the
same cap.

## Plans

Every plan (`aiHelper` feature). Two limits, both per workspace:

- **Questions per week** (`helperQuestionsPerWeek`, ISO week, resets Monday
  00:00 UTC): Free 5, Pro 20, Business 50. One per question, reserved before the
  first call and released if nothing came back. Shown as "up to" on the pricing
  cards, because the monthly cap can end the month first.
- **Monthly spend cap**, above. Customers see it as a percentage ("AI Helper
  allowance, 40% used"), never in dollars. Staff see dollars on the customer's
  admin page.

No usage emails for either.

## Privacy

The privacy policy says what goes to the model provider: the question and the
parts of the account setup the answer needs. Never followers' messages or
usernames.

## Tests

`scripts/e2e-helper.ts`, run by `pnpm e2e`: the guide's paths, plan gating and
metering, draft validation and customisation, workspace isolation and the
no-follower-data rule, and the real loop against a stubbed model (tool round
trip, events, cache placement, fallback header).
