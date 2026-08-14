# Setup

## Running locally

Requires Node 22+, PostgreSQL and Redis.

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL and REDIS_URL
pnpm db:deploy                # create the schema from the migration history
pnpm db:seed                  # optional demo data
pnpm dev                      # web app on :3000
pnpm worker                   # second terminal — delays, broadcasts, cron
```

The seed creates a sign-in you can use immediately:

```
demo@instadm247.test / demo1234
```

Its Instagram account is a **demo** account (`status: "demo"`), so the dispatcher
records messages as if they were sent rather than calling the Graph API. That's
deliberate — the whole product is explorable before any Meta credentials exist.

### The worker is not optional in production

The Next.js server handles webhooks and sends immediately. Everything
*time-based* runs in the worker: delayed flow steps, broadcasts, token refresh,
analytics rollups and the DM Planner scanner. Without it, a flow with a delay
will still fire — the `sweep_windows` job is the safety net — but only once a
worker comes back.

## Environment variables

See `.env.example` for the full list. The three that matter:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL |
| `REDIS_URL` | for delays | Falls back to inline processing when absent |
| `SESSION_SECRET` / `ENCRYPTION_KEY` | in production | The app refuses to boot in production with the dev defaults |
| `META_APP_ID` / `META_APP_SECRET` | to go live | Without them the UI works fully; only live Instagram calls are disabled |
| `ANTHROPIC_API_KEY` | for AI replies | Without it the AI node answers from the knowledge base directly, or falls back |

Generate secrets with:

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (must decode to exactly 32 bytes)
```

## Connecting Instagram for real

1. Create an app at **developers.facebook.com** and add the **Instagram** use case.
2. Choose **API setup with Instagram login** (not Facebook login) — this is the
   path that doesn't require a linked Facebook Page.
3. Copy the Instagram **App ID** and **App secret** into `META_APP_ID` and
   `META_APP_SECRET`, then restart.
4. In the App Dashboard, paste the URLs shown on **Dashboard → Instagram
   accounts** (they're also on **Settings**):

   | Field | Value |
   |---|---|
   | OAuth Redirect URL | `<APP_URL>/api/instagram/callback` |
   | Webhook callback URL | `<APP_URL>/api/webhooks/instagram` |
   | Webhook verify token | whatever you set as `META_WEBHOOK_VERIFY_TOKEN` |
   | Deauthorize callback URL | `<APP_URL>/api/instagram/deauthorize` |
   | Data deletion request URL | `<APP_URL>/api/instagram/data-deletion` |

5. Subscribe to the webhook fields listed on that page (`comments`,
   `live_comments`, `messages`, `messaging_postbacks`, …).
6. Request these permissions: `instagram_business_basic`,
   `instagram_business_manage_messages`, `instagram_business_manage_comments`.
7. Click **Connect Instagram** in the dashboard.

Webhooks need a public HTTPS URL. For local development, tunnel with ngrok or
Cloudflare Tunnel and set `APP_URL` to the tunnel address.

### App Review

Advanced Access is required before the app works for accounts that don't have a
role on it. Submit the three permissions above, plus the **Human Agent** feature
if the Inbox should reply beyond 24 hours. The privacy policy, terms and data
deletion pages ship at `/privacy`, `/terms` and `/data-deletion` — fill in the
bracketed placeholders in those files before submitting.

## Checks

```bash
pnpm typecheck   # tsc
pnpm build       # production build
pnpm e2e         # engine + safety-rule checks against a live database
```

`pnpm e2e` needs a seeded database. It drives a real webhook payload through
signature verification, parsing, trigger matching, flow execution and the
dispatcher, and asserts the safety rules actually hold — one private reply per
comment (including under concurrency), window enforcement, opt-out handling, and
that the `HUMAN_AGENT` tag is never attached to automation.

## Deploying

See **[`docs/DEPLOY.md`](DEPLOY.md)** for server sizing and a full step-by-step
runbook. The short version — two processes from one checkout:

```bash
pnpm build && pnpm start     # web
pnpm worker                  # worker
```

Run `pnpm db:deploy` (`prisma migrate deploy`) as a release step; never
`db push` against a database holding real data. Point `APP_URL` at the public HTTPS origin — the OAuth redirect
and webhook URLs are derived from it.
