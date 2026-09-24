# Email

Transactional email — account, billing and alert mail — sent through **Amazon
SES** (API v2). No marketing email; nothing here is a newsletter.

Code: `src/lib/email/` (`templates.ts`, `send.ts`, `tokens.ts`, `notify.ts`).
Log: the `EmailMessage` table, browsable at **/admin/emails**.

## Senders

One address per kind of mail, all on the verified domain. None needs a mailbox —
replies go to Reply-To.

| Sender | Used for | Env override |
|---|---|---|
| `InstaDM247 <accounts@instadm247.com>` | Verify email, password reset, password changed | `EMAIL_FROM_ACCOUNTS` |
| `InstaDM247 Billing <billing@instadm247.com>` | Subscription changes, failed payments, renewal and ending reminders, usage limits, plans granted by staff | `EMAIL_FROM_BILLING` |
| `InstaDM247 Alerts <alerts@instadm247.com>` | Instagram needs reconnecting, Instagram access removed, suspended / reinstated | `EMAIL_FROM_ALERTS` |
| Reply-To on everything: `support@instadm247.com` | The only address that must be a real, read inbox | `EMAIL_REPLY_TO` |

Why split: a customer sees at a glance whether mail is about signing in, money,
or something needing attention, and can filter on it. And if one stream ever
gets a reputation problem it doesn't take password resets down with it.

## What is sent, and when

| Template | Trigger | Deduped by |
|---|---|---|
| `verify_email` | Sign-up; **Resend email** on the dashboard banner | 60 s cooldown per user |
| `password_reset` | `/forgot-password` | 60 s cooldown per user |
| `password_changed` | A reset completes | — |
| `subscription_activated` | Subscription becomes active from nothing, pending, or lapsed | Once per subscription |
| `subscription_plan_changed` | Plan key changes on an active subscription | Per event time |
| `subscription_cancel_scheduled` | `cancelAtPeriodEnd` turns on | Per billing period |
| `subscription_payment_failed` | Becomes `past_due` | Per billing period |
| `subscription_payment_recovered` | `past_due`/`on_hold` → `active` | Per billing period |
| `subscription_on_hold` | Becomes `on_hold` | Per billing period |
| `subscription_ended` | A running plan becomes `cancelled`/`expired`/`failed` | Once per subscription |
| `renewal_reminder` | Daily job: **yearly** plans renewing in 5–8 days | Per billing period |
| `refund_issued` | Staff refund the unused months of an annual plan (replaces `subscription_ended` for that cancellation) | Per payment |
| `plan_ending_reminder` | Daily job: cancelled plans ending in 1–4 days | Per billing period |
| `usage_threshold` | A DM or AI-reply reservation lands on 80 % or 100 % of the monthly quota | Per workspace, month, metric, threshold |
| `plan_granted` | Staff override that actually raises the plan (a checkbox, on by default) | Per grant |
| `instagram_reconnect` | Instagram rejects the token — in a send or in the daily refresh | Per break (keyed to the last successful refresh) |
| `instagram_access_removed` | Meta's deauthorize callback | Per account per day |
| `account_suspended` / `account_reinstated` | Staff suspend / unsuspend (only on an actual change) | Per action |

Subscription mail is decided by comparing the subscription **before and after**
each webhook, not by event type: Dodo sends several events for one change, and a
`subscription.updated` that changes nothing must stay silent. Monthly plans get
no renewal reminder — the receipt Dodo sends is enough; a yearly charge is large
and easily forgotten, so it gets a week's notice.

Everything billing- or alert-related goes to the workspace **owner**.

## The two sending paths

**Secret mail** (verification, reset) is sent **immediately, in the request**,
and is **never queued and never stored**: the log row has the subject and
recipient but `params` is NULL, so neither Redis nor the database ever holds the
link. If SES fails, the user asks again (a failed send doesn't start the
cooldown). Staff can't retry these from /admin — by design.

**Everything else** is written to `EmailMessage` and queued on the `email`
BullMQ queue (5 attempts, exponential backoff). Throttling and SES-side faults
retry; a rejected address, a paused account or an unverified domain fail at
once. With no Redis, it sends inline. A failed row can be retried from
/admin/emails, which is audited.

Every send path is wrapped so an email failure **never** fails the webhook, the
DM send or the admin action that caused it.

## Tokens

32 random bytes; only the SHA-256 is stored (`EmailToken`). Single-use, and
issuing a new one retires older ones. Verification links last 24 h, reset links
1 h. A reset signs out every session and verifies the address.

Mail scanners (Outlook Safe Links and the like) open links before people do.
So: the reset page only shows a form and spends the token on submit; and a
verification link that was already used still shows "you're verified" if the
address is verified.

The forgot-password endpoint answers identically whether or not the address has
an account.

## Verification gates

Unverified users see a banner with **Resend email**. The only thing that
requires a verified address is **starting a checkout** — receipts and payment
warnings must reach someone. Both apply only when email is configured;
otherwise there'd be a wall with no door.

Users who existed before this feature were marked verified by the migration.

## Setting up SES (owner)

1. **SES console → Identities → Create identity → Domain** `instadm247.com`, in
   the region you'll set as `SES_REGION`. Turn on **Easy DKIM** (RSA 2048) and add
   the three CNAMEs to DNS.
2. **Custom MAIL FROM domain** (same identity page): `mail.instadm247.com`. Add
   its MX and SPF TXT records. This aligns SPF for DMARC.
3. **DMARC** TXT at `_dmarc.instadm247.com`, start with
   `v=DMARC1; p=none; rua=mailto:support@instadm247.com` and tighten to
   `quarantine` once reports look clean.
4. **Request production access** (Account dashboard). Until granted, SES only
   sends to verified addresses. Describe it truthfully: transactional mail to
   customers who signed up — verification, password resets, billing notices,
   account alerts; no marketing; bounces and complaints handled by SES's
   account-level suppression list.
5. **Account-level suppression list**: enable for bounces and complaints
   (Configuration → Suppression list). SES then stops sending to addresses that
   hard-bounced or complained, which protects the sending reputation.
6. **IAM user** with only `ses:SendEmail` (and optionally restrict
   `ses:FromAddress` to the three senders). Put its keys on the server as
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
7. Optional: a **configuration set** with event publishing to CloudWatch or SNS,
   named in `SES_CONFIGURATION_SET`. Each message is tagged with `template` and
   `category`, so bounce rates can be broken down per template.
8. Make `support@instadm247.com` a real inbox (Google Workspace, Zoho, or SES
   receiving rules) — every email says "just reply".
9. Set `EMAIL_PROVIDER=ses` and `SES_REGION`, restart both the web and worker
   services, sign up with a fresh address, and watch the row reach **sent** at
   /admin/emails with an SES message ID.

The server refuses to start with `EMAIL_PROVIDER=ses` and no region.

## Without SES

Leave `EMAIL_PROVIDER` unset. Nothing is sent, nothing breaks: every message is
logged as **skipped**, the verify banner and checkout gate are off, and outside
production the email text (links included) is printed to the console so flows
can be followed in development. It is never printed in production.

## Rules

- Never queue or store anything that can sign someone in.
- Never log an email body in production.
- Every new automatic email needs a dedupe key; webhooks and jobs repeat.
- Customer-facing copy names no infrastructure — `pnpm e2e` scans
  `templates.ts` along with the rest of the customer tree.
