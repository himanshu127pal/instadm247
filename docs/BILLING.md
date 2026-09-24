# Billing

Pricing, plans, metering and payments. Read this before touching anything under
`src/lib/billing/`, `src/lib/plan.ts`, or the Dodo webhook.

## Decisions (owner-approved)

| Decision | Choice | Why |
|---|---|---|
| Provider | **Dodo Payments**, merchant of record | Sells worldwide; Dodo is the seller of record and handles VAT/GST/sales tax in every jurisdiction. Payouts reach an Indian bank as export-of-services remittance. |
| Tiers | **Free / Pro / Business**, plus internal `unlimited` | Priced against LinkDM: Pro matches their $19 tier's caps and adds AI; Business matches their top tier's caps for less. |
| Metered on | Connected Instagram accounts, automated DMs per month, AI replies per month, and feature gates | Owner's choice. |
| Safety | **Never gated, on any plan** | The product's promise is that creators don't get banned. Competitors charge for Slow Down and viral protection; we don't. The window, rate limits and dedupe are also hard rules in `dispatch.ts` — gating them would mean weakening the dispatcher. |
| Human replies | **Never blocked and never counted** | A person answering their own customer in the Inbox is not what the plan meters. Same principle as the opt-out rule, which also exempts human replies. |
| Failed payment | Dodo's own dunning decides | `past_due` keeps the plan through Dodo's grace window; `on_hold` degrades to Free. No data is deleted on a downgrade. |
| Refunds | **Monthly: none. Annual: on request, less the months used at the monthly price. Nothing else** | Owner's policy, published at `/refunds`. Used months at the monthly rate, so an annual discount can't be used to buy months cheaply and refund the rest. No "charged in error" refunds either — it can't be verified. See §Refunds. |
| Rollout | **Inert behind `BILLING_ENABLED`** | Metering runs and plans resolve from day one, but nothing is enforced until the flag is on — so the deploy that ships this is not the deploy that starts charging. |

## Plans

Defined once, in `src/lib/billing/plans.ts`. That file is the price list.

| | Free | Pro | Business | Unlimited (internal) |
|---|---|---|---|---|
| Instagram accounts | 1 | 3 | 10 | ∞ |
| Automated DMs / month | 1,000 | 25,000 | 300,000 | ∞ |
| AI replies / month | 0 | 1,000 | 10,000 | ∞ |
| AI Helper questions / month | 0 | 150 | 500 | ∞ |
| Core AutoDM, story replies & mentions, DM keywords, comment replies, inbox starters, link in bio | ✓ | ✓ | ✓ | ✓ |
| Every safety feature | ✓ | ✓ | ✓ | ✓ |
| Advanced flows (delay, condition, randomizer, custom fields) | | ✓ | ✓ | ✓ |
| Lead capture, coupons, templates, DM planner, rewind | | ✓ | ✓ | ✓ |
| Broadcasts, scheduler, Kit / Flodesk | | ✓ | ✓ | ✓ |
| AI agent, AI Helper | | ✓ | ✓ | ✓ |
| Public API, outbound webhooks, HTTP request node | | | ✓ | ✓ |

`unlimited` is not sold. It is what staff, comps and every workspace that existed
before billing shipped are on, and it is what everyone is treated as while
`BILLING_ENABLED` is off.

**Team seats are not a plan feature** because inviting a second member to a
workspace is not built — only the owner's membership is ever created. Don't
advertise seats until invites exist.

## How a workspace's plan is decided

`Workspace.planKey` is the **resolved** plan, recomputed whenever something that
affects it changes, so every enforcement point reads one column with no joins.
`resolvePlanKey()` in `src/lib/billing/resolve.ts` is a pure function. The
result is the **highest** of:

- an admin **override** that has not expired (`planOverride`, `planOverrideUntil`);
- what each of the workspace's **subscriptions** grants, by Dodo status:
  - `active`, `past_due` → the subscribed plan (`past_due` is Dodo's grace window)
  - anything else, including statuses Dodo adds later → Free

**`cancelled` is not "paid through".** In Dodo, a customer who cancels to stop
renewing stays `active` with `cancel_at_next_billing_date` set; the SDK: *"the
subscription will remain active until the end of billing period"*. So `cancelled`
means access has already ended — the period ran out, or it was cancelled
immediately, for example with a refund. Treating it as paid-through would give a
refunded customer the rest of their month free.
- **Free.**

The highest, not "override wins": an override exists to *grant* — a comp, a
grandfathered workspace — and must never be able to take away something a
customer is paying for. Restricting a customer is what suspension is for.

It is recomputed on every subscription webhook, on every admin override change,
and by the `reconcile_plans` maintenance job, which catches the transitions that
happen by the clock alone — an override expiring. (A subscription's own period
ending arrives as a webhook.)

`BILLING_ENABLED` is applied at read time in `getLimits()`, not stored — so
flipping it takes effect immediately, and while it is off the admin panel still
shows which plan each workspace *would* be on.

## Metering

`UsageCounter` holds one row per workspace, calendar month (UTC, `YYYY-MM`) and
metric. Metrics are `dms`, `ai_replies` and `helper`.

A quota is **reserved before** the action and **released** if the action does
not complete, using a single conditional `UPDATE … WHERE count < limit`. That is
the only raw SQL in the codebase and it is there on purpose: it makes the check
and the increment one atomic statement, so concurrent sends can never push a
workspace past its limit. Prisma's API cannot express a conditional increment.

- **DMs** — reserved in `dispatch.ts` immediately before `client.sendMessage`,
  after every guard has passed. Released on any failure, skip or window error.
  Simulated sends (demo accounts, unconfigured server) never reserve, so they
  never spend a customer's quota. Human replies never reserve.
- **AI replies** — reserved before the model is called. When exhausted, the AI
  step falls back to the knowledge-base article or the fallback message, exactly
  as it does when no model key is configured. A flow never stops for this.
- **AI Helper questions** — one per question, reserved before the model is
  called and released if nothing at all came back. No usage email: it affects
  only the customer's own dashboard, never anything their followers see. The
  allowance exists because every question is a paid model call — see
  `docs/HELPER.md` §Cost.

Counting runs even while billing is off, so usage history exists on the day it is
switched on.

## Feature gates

Enforced in two places, and both matter:

- **At save** — the API route that creates or enables the thing returns `402`
  with an upgrade message.
- **At run** — `executeNode` refuses a gated node for a workspace whose plan
  lacks the feature, and halts the run with a reason the customer can read. This
  is what makes a **downgrade** work without touching any data: a Pro customer's
  automations are kept intact on Free, and simply stop at the first node the plan
  no longer covers. Upgrading again resumes them with nothing to rebuild.

Accounts over the cap after a downgrade stay connected. The cap only blocks
connecting another one. Disconnecting a customer's account is not something the
billing system should ever do on its own.

## Branding

Free workspaces carry InstaDM247 branding; the `removeBranding` feature, in
Pro and Business, takes it away. Everything is decided from the plan in force
when a page renders or a DM leaves — nothing is stored per workspace — so it
disappears the moment someone upgrades and returns the day a paid plan ends,
with no job to run and nothing to migrate. With `BILLING_ENABLED` off nobody is
branded, like every other gate. Code: `src/lib/branding.ts`.

- **Link-in-Bio badge** — "Made with InstaDM247", linked to our site with UTM
  tags. On Free it shows regardless of the saved toggle, which is locked in the
  editor; the saved value applies again on a paid plan. The page's title and
  link preview end in "· InstaDM247".
- **Automated DMs** — the first automated DM (flow, AI, broadcast, private
  reply) a person receives in a day gets `⚡ Sent with InstaDM247 ·
  instadm247.com` as a final paragraph. At most once per person per 24 hours
  (`Contact.brandedAt`, claimed atomically in `dispatch.ts`), so a multi-step
  flow doesn't repeat it. Never on a message a person typed in the Inbox, never
  on media or carousels, and never when it would push the text past
  Instagram's byte limit — the customer's words are not shortened to fit. The
  Inbox shows the message as sent, line included. Precedent: LinkDM brands DMs
  on its lower tiers and sells removal (their feature #11).
- The automation editor tells a Free customer this up front.

## Dodo Payments — verified API reference

Dodo's documentation site is not reachable from the build environment, so this
section was taken from the source of their official TypeScript SDK
(`dodopayments@2.51.0`), whose types are generated from their OpenAPI spec, and
from the `standardwebhooks` package the SDK uses to verify webhooks. Re-verify
against the SDK before changing any of it.

**Hosts** — `https://live.dodopayments.com`, `https://test.dodopayments.com`.
**Auth** — `Authorization: Bearer <DODO_PAYMENTS_API_KEY>`.

| Call | Endpoint | Used for |
|---|---|---|
| Create customer | `POST /customers` `{ email, name, metadata? }` → `{ customer_id, … }` | Once per workspace, before its first checkout |
| Create checkout | `POST /checkouts` `{ product_cart: [{ product_id, quantity }], customer: { customer_id }, return_url, metadata? }` → `{ session_id, checkout_url }` | Upgrade button |
| Customer portal | `POST /customers/{id}/customer-portal/session?return_url=…` → `{ link }` | Manage subscription, invoices, card |
| Get subscription | `GET /subscriptions/{id}` | Admin "resync from Dodo" |
| Schedule cancel | `PATCH /subscriptions/{id}` `{ cancel_at_next_billing_date: true, cancellation_comment }` | Admin cancel |
| Cancel now | `PATCH /subscriptions/{id}` `{ status: "cancelled", cancel_reason: "cancelled_by_merchant", cancellation_comment }` | Only with an annual refund |
| Partial refund | `POST /refunds` `{ payment_id, items: [{ item_id: <product_id>, amount, tax_inclusive: true }], reason }` → `{ refund_id, status, … }` | Annual refund. `amount` is in the payment's smallest currency unit |

Webhooks are mapped to a workspace by **`data.customer.customer_id`** first,
because we create that customer ourselves and store it on the workspace. Checkout
`metadata.workspace_id` is sent too, but only as a fallback: the SDK documents
checkout metadata as belonging to the payment, and does not promise it reaches
the subscription object.

### Webhook verification (Standard Webhooks)

Headers: `webhook-id`, `webhook-timestamp` (unix seconds), `webhook-signature`.

1. Strip a leading `whsec_` from the secret and **base64-decode** the rest — the
   decoded bytes are the HMAC key, not the string.
2. Sign `${webhook-id}.${webhook-timestamp}.${raw body}` with HMAC-SHA256 and
   base64-encode it.
3. `webhook-signature` is a space-separated list of `v1,<signature>`; any one
   matching, compared in constant time, passes. Other versions are ignored.
4. Reject a timestamp more than 5 minutes either side of now. The server clock
   must be NTP-synced or every webhook fails.

Verify against the **raw** body. Re-serialising parsed JSON changes the bytes.

### Envelope and events

`{ business_id, type, timestamp, data }`. Subscription events carry the full
subscription (`subscription_id`, `status`, `product_id`, `customer`,
`previous_billing_date`, `next_billing_date`, `cancel_at_next_billing_date`,
`cancelled_at`, `expires_at`, `metadata`, `payment_frequency_interval`) plus
`past_due_ends_at`. Payment events carry `payment_id`, `subscription_id`,
`status`, `total_amount` (minor units), `currency`, `customer`, `error_code`,
`error_message`, `invoice_id`.

Subscription statuses: `pending`, `active`, `on_hold`, `paused`, `cancelled`,
`failed`, `expired`, `past_due`.

We act on every `subscription.*` event by applying the subscription payload
(`active`, `renewed`, `on_hold`, `paused`, `unpaused`, `cancelled`, `expired`,
`failed`, `past_due`, `plan_changed`, `updated`). Payment, refund and dispute
events are recorded for tracing but change nothing, because the subscription
events that accompany them carry the state. Everything else is logged and
acknowledged.

## Refunds

The policy, published at **`/refunds`** and linked from the footer, terms,
pricing, sign-up and billing pages:

- **Monthly plans are not refundable.** Cancelling stops renewal; the paid month
  runs out.
- **Annual plans** are refunded, on request to `support@instadm247.com`: what
  was paid for the year, less the months used charged at the plan's **monthly**
  list price. The month in progress counts as used. In list terms
  `refund = yearly − used × monthly`; applied as that share of what was
  actually paid, so tax and a local currency come back in proportion:
  `paid × (yearly − used × monthly) ÷ yearly`, rounded down to the minor unit.
  With "two months free" pricing nothing is left from the 10th month. The plan
  then ends immediately.
- **Nothing else is refunded** — not partial months, not unused allowances, and
  not claims of a mistaken charge, which can't be verified. A genuine payment
  dispute goes through Dodo as merchant of record.

Prices come from `src/lib/billing/plans.ts` at the time of the request, so a
customer who bought before a price change is refunded against today's prices.
The arithmetic is `src/lib/billing/refund.ts`, and the page says the same thing;
change them together.

**Processing a request (staff):**

1. Check it came from the workspace owner's address — the customer page lists
   members. If not, reply asking the owner to write in.
2. Customer page → the annual subscription → **Refund annual plan**. Enter the
   date the email arrived, then **Preview refund**. The payment and amount come
   from our own trace of Dodo's `payment.succeeded`, never typed in.
3. Admin only: give the reason (who asked, when) and **Refund … and end the plan**.
   That issues the partial refund, then cancels the subscription now. The refund
   goes first: if the cancel fails, the customer has their money and keeps the
   plan until you retry — and a retry sees the recorded refund and only retries
   the cancel.
4. The customer gets the `refund_issued` email from `billing@`. Dodo then sends
   `refund.*` and `subscription.cancelled` webhooks, which land in the trace and
   move the workspace to Free. The usual "plan has ended" email is suppressed for
   a subscription we just refunded.

The tool refuses, with the reason, when the plan is monthly, not active, already
refunded somewhere else (e.g. in Dodo's dashboard), or has no payment on record
for the year — handle those in Dodo's dashboard.

Every refund is in the audit log (`billing.refund`) and the payment trace
(`refund.create`, `subscription.cancel_now`).

## The payment trace log

**Every** hit on the webhook is written to `PaymentEvent` before anything else
happens — including requests with a bad or missing signature, duplicates, events
we ignore, and ones whose processing fails. Outbound calls to Dodo (customer,
checkout, portal, cancel, resync) are written there too, so a customer's trail
reads end to end: *clicked Upgrade → checkout created → payment succeeded →
subscription active*.

Status values: `processed`, `ignored` (type we don't act on), `duplicate`
(this `webhook-id` was already processed), `unmatched` (no workspace for the
customer), `rejected` (signature failed), `failed` (processing threw — Dodo
will retry, because we answer `500`).

Retention differs by status. Verified events are the financial record and are
kept. Rejected ones are unauthenticated input and are purged after 30 days with
the webhook payloads; their stored body is capped at 8 KB so the endpoint can't
be used to fill the disk.

Staff see it at **`/admin/billing`**, and per customer on the customer page.

## Environment

```
BILLING_ENABLED=false                 # nothing is enforced until this is true
DODO_PAYMENTS_API_KEY=
DODO_PAYMENTS_WEBHOOK_SECRET=         # whsec_…
DODO_PAYMENTS_ENVIRONMENT=test_mode   # or live_mode
DODO_PRODUCT_PRO_MONTHLY=
DODO_PRODUCT_PRO_YEARLY=
DODO_PRODUCT_BUSINESS_MONTHLY=
DODO_PRODUCT_BUSINESS_YEARLY=
```

Products are created in the Dodo dashboard as subscriptions; their IDs go here.
A webhook for a product ID not in this list is recorded as `failed`, not
guessed at.

**Webhook URL to register in Dodo:** `<APP_URL>/api/webhooks/dodo`.

## Switching it on

1. Create the four products in Dodo (test mode first).
2. Set the environment above with `BILLING_ENABLED=false`, deploy, register the
   webhook, and run a test checkout end to end. Watch it arrive in `/admin/billing`.
3. Check `/admin/customers` — every pre-billing workspace should show an
   `unlimited` override labelled as such.
4. Set `BILLING_ENABLED=true` and restart.
