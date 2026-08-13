# InstaDM247

Instagram DM automation for creators and brands, built entirely on Meta's
official APIs.

Every comment, story reply, @mention, Live comment and DM becomes a
conversation — and the safety rules that keep an account healthy are the
architecture, not an afterthought.

```bash
pnpm install
cp .env.example .env      # set DATABASE_URL and REDIS_URL
pnpm db:push && pnpm db:seed
pnpm dev                  # web
pnpm worker               # delays, broadcasts, cron
```

Sign in with `demo@instadm247.test` / `demo1234`. **No Meta credentials are
needed to explore** — the seeded Instagram account is a demo account, so sends
are simulated.

## What it does

| | |
|---|---|
| **Triggers** | Comments (posts, Reels, ads, Live), story replies, story @mentions, DM keywords, conversation starters, button taps, referral links |
| **Flows** | Visual builder, 15 step types — messages, carousels, delays, branches, follower gates, in-DM forms, AI replies, webhooks, human handoff |
| **Inbox** | Unified live chat with human takeover that pauses automation per thread |
| **Audience** | Contacts CRM with tags, custom fields, segments, CSV + Excel export |
| **Campaigns** | Broadcasts with eligibility preview, smart re-engagement, DM Planner |
| **AI** | Answers from your own knowledge base, hands off when unsure |
| **Analytics** | Sent, opened, clicked, CTR, new followers, per-step funnels |
| **Safety** | Every skipped send, with the reason, in a Safety Center |

## Why accounts stay safe

A single dispatcher (`src/lib/engine/dispatch.ts`) is the only code path that
can send anything, and it enforces all of this before every message:

- Instagram's **24-hour messaging window**, tracked per contact
- **One private reply per comment**, claimed atomically so duplicate webhooks
  can't double-send
- The **7-day private-reply deadline** (Live: during the broadcast only)
- **Per-account rate limits** well under Meta's published ceilings
- **Slow Down mode** — auto-armed for 2 hours when Instagram throttles you
- **`HUMAN_AGENT` only on messages a human typed**, never on automation
- **Opt-outs** honoured instantly across every automation

No scraping, no unofficial endpoints, no cookie-session automation, no
follow/unfollow tricks.

## Docs

| File | What's in it |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Project memory — read first |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Competitor matrix and the Phase 1 / Phase 2 split |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the pieces fit together |
| [`docs/META_API.md`](docs/META_API.md) | Grounded Instagram API reference — check before writing API code |
| [`docs/SETUP.md`](docs/SETUP.md) | Local setup, connecting Instagram, deploying |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Build status and known gaps |

## Stack

Next.js 15 · TypeScript · PostgreSQL + Prisma · Redis + BullMQ · Tailwind v4 ·
React Flow · Recharts

## Checks

```bash
pnpm typecheck
pnpm build
pnpm e2e        # 66 engine + safety-rule checks against a live database
```
