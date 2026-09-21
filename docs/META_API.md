# Meta / Instagram Platform — Grounded API Notes

Sourced from `developers.facebook.com` via the Meta Developer Tools MCP (August 2026).
**This file is the anti-hallucination reference.** If you are about to write code that
calls Instagram, check it against this file first. If something you need is not here,
look it up again with `devtools_discovery` — do not guess an endpoint shape.

---

## 1. Which API path we use

We use **Instagram API with Instagram Login** (a.k.a. *Business Login for Instagram*).

- The creator logs in with **Instagram directly** — no linked Facebook Page required.
- Host for API calls: `https://graph.instagram.com`
- Host for OAuth authorize: `https://www.instagram.com/oauth/authorize`

The alternative path (Instagram API with Facebook Login, calls to
`https://graph.facebook.com/<PAGE_ID>/messages`, requires `pages_messaging`) is **not**
our default. `src/lib/meta/` keeps an adapter seam so it could be added later.

## 2. Scopes

Current scope values (the old `business_*` values were deprecated 2025-01-27 — never use
them):

| Scope | Needed for |
|---|---|
| `instagram_business_basic` | Profile, media, required for everything |
| `instagram_business_manage_messages` | Send/receive DMs, `messages` webhook |
| `instagram_business_manage_comments` | Read comments, reply to comments, `comments` / `live_comments` webhooks |
| `instagram_business_content_publish` | Publishing content (not used in Phase 1, requested only if enabled) |

## 3. OAuth flow

1. **Authorize** — redirect the user to
   `https://www.instagram.com/oauth/authorize?client_id=<IG_APP_ID>&redirect_uri=<REDIRECT>&response_type=code&scope=<comma-separated>&state=<csrf>`
2. **Exchange code → short-lived token** — `POST https://api.instagram.com/oauth/access_token`
   with `client_id`, `client_secret`, `grant_type=authorization_code`, `redirect_uri`, `code`.
   Returns `access_token`, `user_id`, `permissions`.
3. **Short-lived → long-lived (60 days)** —
   `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<SECRET>&access_token=<SHORT>`
4. **Refresh long-lived** —
   `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<LONG>`
   Token must be at least 24 h old and not expired. We refresh on a daily cron at
   ~45 days of age.

Also required by App Review and configured in the App Dashboard:
- Redirect URL
- **Deauthorize callback URL**
- **Data deletion request URL**

## 4. Webhooks

Endpoint: `POST /api/webhooks/instagram`. Verification handshake: `GET` with
`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` — echo the challenge when the
verify token matches.

**Every payload must be verified** against the `X-Hub-Signature-256` header:
`sha256=` + HMAC-SHA256 of the **raw** request body using the **app secret**. Compare in
constant time. Reject otherwise.

Webhook fields we subscribe to (Instagram Login permission column):

| Field | Permission | What it gives us |
|---|---|---|
| `comments` | `instagram_business_manage_comments` | Comments on posts, reels **and ads/boosted posts** (payload then includes `ad_id` and `ad_title` on the media object) |
| `live_comments` | `instagram_business_manage_comments` | Comments during a Live broadcast |
| `messages` | `instagram_business_manage_messages` | Inbound DMs, **story replies** (`message.reply_to.story`), **story mentions** (`attachments[].type = story_mention`) |
| `messaging_postbacks` | `instagram_business_manage_messages` | CTA button clicks, **ice breaker clicks** |
| `messaging_optins` | `instagram_business_manage_messages` | Opt-ins |
| `messaging_referral` | `instagram_business_manage_messages` | `ig.me` link entries |
| `messaging_seen` | `instagram_business_manage_messages` | Read receipts → powers "Opened" analytics |
| `message_reactions` | `instagram_business_manage_messages` | Reactions |
| `messaging_handover` | `instagram_business_manage_messages` | Handover protocol |
| `message_echoes` | `instagram_business_manage_comments` | Echoes of messages we sent, incl. `is_self` |

**`messaging_policy_enforcement` is not available on this login type.** It was in
the list until Instagram answered the subscription with the set it does accept,
reproduced below. One invalid name fails the whole `subscribed_apps` call, so it
took every valid field down with it and left connected accounts subscribed to
nothing. The Safety Center no longer implies it is watching for policy notices
it cannot receive.

The set Instagram Login accepts, verbatim from Meta's error:

```
agent_messages, messages, messaging_postbacks, messaging_seen,
messaging_handover, messaging_referral, messaging_optins, message_reactions,
message_edit, standby, comments, live_comments, mentions, story_insights,
creator_marketplace_projects, creator_marketplace_invited_creator_onboarding,
delta, story_reactions, onboarding_welcome_message_series, follow,
comment_poll_response, story_poll_response, share_to_story
```

`pnpm e2e` checks `WEBHOOK_FIELDS` against that set, so an invalid name fails in
CI rather than on a customer's account.

**`mentions` is not story mentions.** Story mentions arrive on `messages` as an
attachment of type `story_mention`; `mentions` is caption and comment @mentions,
which is not a feature in `docs/FEATURES.md`. Don't subscribe to it without
building the feature.

A field being valid is not the same as it being available: it must also be
enabled on the app under *Instagram → Configure webhooks*. A valid-but-unticked
field is refused per-account, which is why the subscriber probes each field and
reports the two cases differently.

Envelope shape: `{ object: "instagram", entry: [ { id, time, messaging: [...] | changes: [...] } ] }`.

Notes captured from the docs:
- Commenting on a boosted/ads post **may produce duplicate webhook notifications** →
  idempotency is mandatory, keyed on comment id / message id.
- Live broadcasts produce a high volume of `live_comments`; the server must absorb the
  burst and must distinguish `live_comments` from `comments`.

## 5. Sending messages

`POST https://graph.instagram.com/<API_VERSION>/<IG_USER_ID>/messages`
with `Authorization: Bearer <ACCESS_TOKEN>`, body:

```json
{ "recipient": { "id": "<INSTAGRAM_SCOPED_ID>" }, "message": { "text": "..." } }
```

Supported message payloads we implement: `text`, `attachment` (image / video / audio by
URL), `attachment.template.type = "button"` (CTA buttons), and
`attachment.template.type = "generic"` (carousel — **max 10 elements**, which is exactly
LinkDM's "up to 10 slides").

Media constraints from the docs: text up to 1000 bytes UTF-8; images PNG/JPEG/GIF up to
8 MB; video MP4/MOV up to 25 MB.

### Private replies (comment → DM)

Same `/messages` endpoint but the recipient is a **comment id**:

```json
{ "recipient": { "comment_id": "<COMMENT_ID>" }, "message": { "text": "..." } }
```

Hard limits, enforced in `src/lib/engine/dispatch.ts`:
- **Exactly one** private reply per comment. Ever.
- Within **7 days** of the comment for posts / ads posts / reels.
- For **Instagram Live**, only **during the broadcast** — once it ends, private replies
  to those comments fail permanently.
- Delivery lands in the user's **Inbox** if they follow the account, otherwise in
  **Requests**.
- The message contains a link back to the post that was commented on.

### Public comment replies

Different API surface: `POST /<IG_COMMENT_ID>/replies`. Does **not** consume the private
reply allowance. Used by the `REPLY_TO_COMMENT` node.

## 6. Messaging window — the rule that governs everything

- Standard window: **24 hours** from the user's last interaction (comment, story reply,
  inbound DM). The user replying resets it to 24 h from that reply.
- **`HUMAN_AGENT` tag extends it to 7 days — for messages a human actually wrote.**
  Meta explicitly prohibits using it for automated messages and detects misuse. Our code
  only ever sets it on Inbox messages typed by a real user.
- Consequence for flows: a flow's delayed steps must all land inside the window. The
  builder validates delays (1 min – 24 h, matching LinkDM's limit) and the dispatcher
  re-checks at send time and drops with a `WINDOW_EXPIRED` reason rather than erroring.

## 7. Rate limits

Published figures we design against (conservative by default):

- ~**200 automated messages/hour per account** is the practical guidance for DM sending.
- **750 private replies per hour** to comments on posts/reels.
- ~100 calls/sec for text & links; ~10/sec for audio & video.
- Messaging endpoints: ~2 calls/sec per professional account; private replies to **Live**
  comments get a much higher ceiling (~100/sec) because of broadcast bursts.

Implementation: per-account token bucket in Redis, plus a global queue concurrency cap,
plus **Slow Down mode** (halves throughput for 2 hours — LinkDM's behaviour) which we
trigger automatically on repeated 429/613 errors and expose as a manual toggle.

## 8. Other endpoints used

| Purpose | Endpoint |
|---|---|
| Account profile | `GET /me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,media_count` |
| Media list (for the media picker) | `GET /me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count` |
| Contact profile (incl. **`is_user_follow_business`** → the Follower Growth check) | `GET /<IGSID>?fields=name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user` |
| Conversations / message history | `GET /me/conversations`, `GET /<CONVERSATION_ID>?fields=messages` |
| Ice breakers & persistent menu | `POST /me/messenger_profile` with `ice_breakers` / `persistent_menu` |
| Subscribe app to webhooks | `POST /<IG_USER_ID>/subscribed_apps?subscribed_fields=...` |

Ice breaker constraints we mirror in the UI: up to **5** configured, **80 characters**
max each, Instagram shows **4**.

## 9. App Review

Advanced Access is required for these to work on accounts that don't have a role on the
app. Permissions to submit: `instagram_business_basic`,
`instagram_business_manage_messages`, `instagram_business_manage_comments`, plus the
**Human Agent** feature if the Inbox is to reply beyond 24 h. Screencasts must show the
real consented flow. Legal pages (privacy policy, terms, data deletion) are served from
the marketing site and must stay reachable.

## 10. Things that are NOT allowed — never implement

- Any unofficial/private endpoint, mobile app reverse-engineering, or cookie-session
  automation.
- Mass unsolicited DMs to users who have not interacted (there is no legal API for it —
  the window is the mechanism that prevents it).
- `HUMAN_AGENT` on automated sends.
- Follow/unfollow/like automation, engagement pods, or any growth action that isn't a
  message the user asked for.
- More than one private reply per comment.
