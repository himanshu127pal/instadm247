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

- Model: `AI_HELPER_MODEL`, default `claude-opus-5`. Adaptive thinking at
  `medium` effort. Server-side refusal fallback (`fallbacks: "default"`) is on
  for `claude-opus-5`, so a declined request is retried on another model instead
  of ending the answer.
- The system prompt and tools (~6k tokens) are the **same for every customer**
  and carry a cache breakpoint, so they're one shared prompt cache across the
  product. Anything per-request (date, the page they came from) goes in a second
  system block after the breakpoint. `pnpm e2e` checks this.
- Rough cost per question on `claude-opus-5`: a few US cents — about $0.03–0.10
  for a typical one or two lookups. At the full allowance that's roughly
  $5–15/month for a Pro workspace (150) and $15–50 for Business (500); most
  customers use far fewer. Setting `AI_HELPER_MODEL=claude-sonnet-5` cuts that by
  more than half, with somewhat less careful answers. Measure real usage before
  changing either the model or the allowances.

## Plans

Pro and Business (`aiHelper` feature), metered as `helperQuestionsPerMonth`
(Free 0, Pro 150, Business 500). One question = one unit, reserved before the
model is called and released if nothing came back. No usage email. While
`BILLING_ENABLED` is off, everyone has it, unlimited. Free workspaces see an
upgrade card instead of the chat.

## Privacy

The privacy policy says what goes to the model provider: the question and the
parts of the account setup the answer needs. Never followers' messages or
usernames.

## Tests

`scripts/e2e-helper.ts`, run by `pnpm e2e`: the guide's paths, plan gating and
metering, draft validation and customisation, workspace isolation and the
no-follower-data rule, and the real loop against a stubbed model (tool round
trip, events, cache placement, fallback header).
