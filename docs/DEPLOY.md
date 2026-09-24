# Deploying to a fresh Linux server

A single-box deployment: Postgres, Redis, the Next.js server and the worker all
on one machine. That is the right shape until you have real traffic — split the
database out first when you outgrow it, not the app.

`docs/SETUP.md` covers local development and the Meta App Dashboard fields in
more detail. This is the server runbook.

## What to provision

**2 vCPU · 4 GB RAM · 80 GB SSD · Ubuntu 24.04 LTS**

Measured on this codebase:

| | Memory |
|---|---|
| `next build` (clean, 48 pages) | **~1.2 GB peak**, ~100 s |
| Next.js server, idle after a few requests | ~250 MB |
| Worker (tsx + 5 BullMQ queues) | ~180 MB |
| PostgreSQL 16, small install | ~200 MB |
| Redis, queues only | ~50 MB |

Steady state is roughly **700 MB of app plus the OS**, so 4 GB leaves real
headroom. The reason not to start at 2 GB is the build: 1.2 GB of build on top
of ~1 GB of running services will OOM-kill something. If you are set on 2 GB,
build somewhere else and ship `.next/`, or add 2 GB of swap and accept a slow
build.

Disk is mostly Postgres. `Message`, `AnalyticsEvent` and `WebhookEvent` are the
tables that grow with volume; 80 GB is a long runway for a first deploy.

Any provider is fine — Hetzner CPX21, DigitalOcean 2 vCPU/4 GB, Vultr, Linode,
a small EC2. Pick one with snapshot backups.

**Scale later by**: raising RAM/CPU on the same box first; then moving Postgres
to managed hosting; then running more worker processes (BullMQ shares the queue,
so a second worker just picks up jobs — no coordination needed).

## Before you touch the server

1. Point an **A record** at the server's IP (`app.yourdomain.com`). HTTPS is not
   optional — Meta will not deliver webhooks to plain HTTP.
2. Have your **Meta App ID and secret** ready if you want Instagram live on day
   one. You do not need them to deploy: the app boots and the entire dashboard
   works without them, and the Settings page says what is missing.

---

## 1. Create a user and lock the box down

SSH in as root, then:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades git curl

ufw allow OpenSSH && ufw allow 80 && ufw allow 443
ufw --force enable
```

Disable root SSH and password auth in `/etc/ssh/sshd_config`
(`PermitRootLogin no`, `PasswordAuthentication no`), then
`systemctl restart ssh`. **Open a second SSH session as `deploy` and confirm it
works before closing this one.**

From here on, work as `deploy`.

## 2. Node 22 and pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable && corepack prepare pnpm@10 --activate
node -v && pnpm -v      # expect v22.x and 10.x
```

## 3. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql <<'SQL'
CREATE USER instadm247 WITH PASSWORD 'PUT_A_LONG_RANDOM_PASSWORD_HERE';
CREATE DATABASE instadm247 OWNER instadm247;
SQL
```

Ubuntu's package listens on localhost only, which is what you want. Do not open
5432 to the internet.

## 4. Redis

```bash
sudo apt install -y redis-server
```

Then edit `/etc/redis/redis.conf` and confirm two settings:

```
bind 127.0.0.1 -::1
maxmemory-policy noeviction
```

`noeviction` is not a preference. **BullMQ stores job state in Redis, and any
eviction policy silently drops queued jobs** — delayed flow steps and broadcasts
would vanish with no error. `noeviction` is the Redis default; the danger is
changing it later while tuning.

```bash
sudo systemctl restart redis-server && redis-cli ping   # PONG
```

## 5. Clone and configure

```bash
sudo mkdir -p /srv/instadm247 && sudo chown deploy:deploy /srv/instadm247
git clone https://github.com/himanshu127pal/instadm247.git /srv/instadm247
cd /srv/instadm247
git checkout main
pnpm install --frozen-lockfile
```

**Do not run `pnpm prune --prod`.** The worker runs TypeScript through `tsx`,
which is a devDependency, so production needs the full install.

Generate secrets and write `.env`:

```bash
cd /srv/instadm247
cat > .env <<EOF
DATABASE_URL="postgresql://instadm247:PUT_A_LONG_RANDOM_PASSWORD_HERE@localhost:5432/instadm247"
REDIS_URL="redis://localhost:6379"
APP_URL="https://app.yourdomain.com"

SESSION_SECRET="$(openssl rand -base64 48)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"

META_APP_ID=""
META_APP_SECRET=""
META_REDIRECT_URI="https://app.yourdomain.com/api/instagram/callback"
META_WEBHOOK_VERIFY_TOKEN="$(openssl rand -hex 24)"
META_API_VERSION="v23.0"

ANTHROPIC_API_KEY=""

# Who gets /admin. See docs/ROADMAP.md for what the two levels can do.
PLATFORM_ADMIN_EMAILS="you@yourdomain.com"
PLATFORM_SUPPORT_EMAILS=""
EOF
chmod 600 .env
```

Keep a copy of `ENCRYPTION_KEY` somewhere safe. It encrypts stored Instagram
access tokens — lose it and every connected account has to reconnect.

`APP_URL` is load-bearing: the OAuth redirect and all webhook URLs derive from
it. It must be the public HTTPS origin, no trailing slash.

Both processes read `.env` from the working directory on their own, so the
systemd units below deliberately do **not** use `EnvironmentFile` — that avoids
systemd and dotenv disagreeing about quoting.

## 6. Create the schema and build

```bash
cd /srv/instadm247
pnpm exec prisma migrate deploy   # applies the committed migration history
pnpm build                        # prisma generate && next build
```

**Do not run `pnpm db:seed` on this server.** The seed creates a demo login
(`demo@instadm247.test` / `demo1234`) with a workspace attached. That is for
local exploration; on a public box it is an open door. Create your real account
through `/signup` instead.

Never use `prisma db push` against this database. It reshapes the schema to
match the models with no record of what it did and no review step, which is
fine against an empty database and a way to lose conversations against a live
one. `migrate deploy` only applies committed migrations, and refuses rather than
guessing.

## 7. systemd units

`/etc/systemd/system/instadm247-web.service`:

```ini
[Unit]
Description=InstaDM247 web
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/instadm247
Environment=NODE_ENV=production
ExecStart=/srv/instadm247/node_modules/.bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/instadm247-worker.service`:

```ini
[Unit]
Description=InstaDM247 worker
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/instadm247
Environment=NODE_ENV=production
ExecStart=/srv/instadm247/node_modules/.bin/tsx --env-file-if-exists=.env src/worker/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`Environment=NODE_ENV=production` matters on **both**. `next start` sets it
itself, but `tsx` does not — and without it the worker's startup check for real
secrets quietly does nothing.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now instadm247-web instadm247-worker
systemctl status instadm247-web instadm247-worker
curl -I http://127.0.0.1:3000/          # expect 200
```

If the web unit dies immediately, `journalctl -u instadm247-web -n 30` will say
exactly which secret is missing — the server refuses to start in production on
development defaults rather than running with forgeable session cookies.

The worker logs `[worker] worker error: connect ECONNREFUSED` on a loop if Redis
is down. It recovers on its own once Redis is back; it does not need a restart.

## 8. HTTPS

Caddy, because it gets and renews certificates without being asked:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
app.yourdomain.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
curl -I https://app.yourdomain.com/      # expect 200 over TLS
```

## 9. Wire up Meta

With the site live on HTTPS, fill in `META_APP_ID` and `META_APP_SECRET` in
`.env`, then `sudo systemctl restart instadm247-web instadm247-worker`.

**Take both from the Instagram product, not from App settings → Basic.**
Instagram Login issues its own app ID and secret, separate from the Facebook
app's. They are under **Instagram → API setup with Instagram login → 3. Set up
Instagram business login → Business login settings**. The Facebook App ID is a
different number, and using it makes every connect attempt fail at Instagram
with *"Invalid request: Request parameters are invalid: Invalid platform app"*.

In the App Dashboard (**Instagram** use case → *API setup with Instagram
login*), set:

| Field | Value |
|---|---|
| OAuth Redirect URL | `https://app.yourdomain.com/api/instagram/callback` |
| Webhook callback URL | `https://app.yourdomain.com/api/webhooks/instagram` |
| Webhook verify token | the `META_WEBHOOK_VERIFY_TOKEN` you generated |
| Deauthorize callback | `https://app.yourdomain.com/api/instagram/deauthorize` |
| Data deletion request | `https://app.yourdomain.com/api/instagram/data-deletion` |

Request these permissions: `instagram_business_basic`,
`instagram_business_manage_messages`, `instagram_business_manage_comments`,
`instagram_business_content_publish`.

You do not need to tick the individual webhook fields by hand — the app
subscribes its own field list (`WEBHOOK_FIELDS` in `src/lib/meta/types.ts`) when
an account connects. **/admin/meta** prints the exact URLs and
field list for this deployment, derived from your `APP_URL`; copy from there
rather than from this page.

Meta calls the webhook URL with a `hub.challenge` when you save it. If
verification fails, the token in the dashboard does not match `.env`.

## 10. Verify end to end

1. Sign up at `https://app.yourdomain.com/signup`.
2. **Connect Instagram** on the dashboard, complete the Business Login consent.
3. Build a comment-to-DM automation, comment on the post from another account.
4. Watch it land: `journalctl -u instadm247-worker -f`.
5. Check **Safety Center** — if the DM did not send, the skip reason is there in
   plain language rather than buried in a log.

Until App Review grants Advanced Access, only accounts with a role on your Meta
app can connect. Test with your own.

## 11. Backups

```bash
sudo mkdir -p /var/backups/instadm247 && sudo chown deploy:deploy /var/backups/instadm247
crontab -e
```

```
0 3 * * * pg_dump "postgresql://instadm247:PASSWORD@localhost:5432/instadm247" | gzip > /var/backups/instadm247/db-$(date +\%F).sql.gz && find /var/backups/instadm247 -name 'db-*.sql.gz' -mtime +14 -delete
```

Copy those off the box — a backup on the same disk is not a backup. Enable your
provider's snapshots too. Redis needs no backup: it holds in-flight jobs, and
losing it costs pending delayed steps, not data.

## 12. Branches and redeploying

`main` is the trunk and is what the server tracks. Work happens on short-lived
branches that are merged into `main` through a pull request, so the server only
ever pulls reviewed commits.

```bash
cd /srv/instadm247
git pull
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy     # no-op when there is nothing new
pnpm build
sudo systemctl restart instadm247-web instadm247-worker
```

There is a few-seconds gap while the web unit restarts. If that becomes
unacceptable, build into a fresh directory and flip a symlink before restarting.

**If this server was first deployed from the `claude/…` branch**, point it at
`main` once — after that, plain `git pull` is correct:

```bash
cd /srv/instadm247
git fetch origin
git checkout main || git checkout -b main origin/main
git branch -u origin/main main
git pull
```

## Billing (Dodo Payments)

Shipping the billing code changes nothing for customers: with `BILLING_ENABLED`
unset, every workspace is treated as unlimited and nobody can check out. Every
workspace that existed before the billing migration carries an explicit
`unlimited` override, labelled as such in `/admin`. Switch it on deliberately:

1. In Dodo (test mode first), create four subscription products — Pro and
   Business, monthly and yearly — at the prices in `src/lib/billing/plans.ts`.
2. Register a webhook at `https://<your domain>/api/webhooks/dodo` and copy its
   `whsec_…` secret.
3. Set the Dodo variables from `.env.example` with `BILLING_ENABLED=false`, then
   restart. The server refuses to start with billing on but the API key or
   webhook secret missing — that combination would take money and then reject
   the webhook that grants the plan.
4. Signed in as platform staff, go to **Plan & billing** and complete a test
   checkout. Watch it arrive at **/admin/billing**: `checkout.create`, then
   `subscription.active` as **processed**, and the workspace's plan changing.
5. Keep the server clock NTP-synced. Webhook signatures are rejected more than
   five minutes either side of now.
6. When it works end to end, move Dodo to live mode, swap in the live keys and
   products, set `BILLING_ENABLED=true`, and restart.

If Dodo asks for your refund policy during onboarding, it's published at
`https://<your domain>/refunds`.

Full design, and Dodo's API as verified against their SDK, in `docs/BILLING.md`.

## Email (Amazon SES)

Without it the app works: every email is logged as skipped at `/admin/emails`,
nobody is asked to verify an address, and checkout doesn't require one. To turn
it on:

1. Verify `instadm247.com` in SES with Easy DKIM, a custom MAIL FROM domain and a
   DMARC record, and request production access. Step by step in
   `docs/EMAIL.md` §Setting up SES.
2. Create an IAM user limited to `ses:SendEmail`.
3. Make `support@instadm247.com` a real inbox — every email says "just reply".
4. Set `EMAIL_PROVIDER=ses`, `SES_REGION`, `AWS_ACCESS_KEY_ID` and
   `AWS_SECRET_ACCESS_KEY` from `.env.example`, then restart **both** the web and
   worker services (the worker sends queued mail and runs the daily reminders).
5. Sign up with a fresh address and watch the verification email reach **sent**
   at `/admin/emails`, with an SES message ID.

## Before App Review

- `/privacy`, `/terms` and `/data-deletion` name the real entity and
  `support@instadm247.com`. **That inbox must exist and be monitored before you
  submit** — reviewers test it, and it is the address data-deletion requests
  arrive at.
- Submit the **Human Agent** feature if the Inbox needs to reply past 24 hours.
- Accounts connected before `instagram_business_content_publish` was added must
  reconnect before the scheduler works. The Scheduler page detects this and says
  so.

## One-time: baselining a server deployed before migrations existed

A server whose database was created with `prisma db push` has all 42 tables but
no `_prisma_migrations` table, so Prisma has no idea which migrations are
already in it. Running `migrate deploy` there stops with **P3005 — "The database
schema is not empty"** and changes nothing. It fails closed, which is the right
behaviour, but it does mean the first deploy after migrations land needs one
extra step.

Do this **once**, on the server, after pulling the commit that adds
`prisma/migrations/`:

```bash
cd /srv/instadm247
git pull
pnpm install --frozen-lockfile

# 1. Back up first. This is the only step here that touches the live database.
pg_dump "$DATABASE_URL" | gzip > ~/pre-baseline-$(date +%F).sql.gz

# 2. Confirm the live schema really does match the migration. Empty output
#    means no drift; anything printed means the database and the schema have
#    diverged — stop and reconcile before going further.
pnpm exec prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script

# 3. Record 0_init as already applied. This only writes a row to
#    _prisma_migrations; it does not touch your tables or your data.
pnpm exec prisma migrate resolve --applied 0_init

# 4. Verify.
pnpm exec prisma migrate status     # "Database schema is up to date!"
pnpm exec prisma migrate deploy     # "No pending migrations to apply."
```

From then on `migrate deploy` is the normal release step and needs no special
handling.

A database created *after* migrations landed needs none of this — `migrate
deploy` builds it from empty in one go.

## Changing the schema from here

```bash
# locally, against a development database
pnpm exec prisma migrate dev --name describe_the_change
```

That writes a new folder under `prisma/migrations/`. Commit it with the code
change — CI applies the full history on every PR, so a missing or broken
migration fails there rather than on the server.

## Brand assets

The logo in `public/brand/` is the owner's own PNG artwork, rendered by
`src/components/brand/logo.tsx`. See the Brand section of `docs/ROADMAP.md`
before changing it — the shipped files are processed (de-backgrounded, trimmed,
resized, palette-encoded) rather than raw, the lockup ships in two theme
variants because a flat image cannot be recoloured by CSS, and the favicon needs
its backing disc.
