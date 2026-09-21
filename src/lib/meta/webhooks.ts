import type { NormalizedEvent, TriggerKind } from "./types";

/**
 * Turn Instagram's webhook envelopes into our canonical `NormalizedEvent`.
 *
 * The envelope is `{ object: "instagram", entry: [...] }` where each entry
 * carries either `changes` (comments / live_comments) or `messaging` (DMs,
 * postbacks, reactions, reads, referrals). See docs/META_API.md §4.
 *
 * Anything we don't turn into a trigger (echoes, reads, reactions) is returned
 * as a `SideEffect` so the ingest worker can still update analytics and the
 * inbox without creating a flow run.
 */

export type SideEffect =
  | { type: "message_seen"; igUserId: string; igsid: string; messageId?: string; at: Date }
  | { type: "reaction"; igUserId: string; igsid: string; messageId?: string; emoji?: string; action?: string; at: Date }
  | { type: "echo"; igUserId: string; igsid: string; messageId?: string; text?: string; at: Date }
  | { type: "policy_enforcement"; igUserId: string; reason: string; raw: unknown; at: Date }
  | { type: "optin"; igUserId: string; igsid: string; raw: unknown; at: Date };

export type ParsedWebhook = { events: NormalizedEvent[]; effects: SideEffect[] };

type AnyRecord = Record<string, unknown>;

function rec(v: unknown): AnyRecord {
  return (v && typeof v === "object" ? v : {}) as AnyRecord;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function toDate(v: unknown): Date {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000);
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return new Date();
}

export function parseWebhook(body: unknown): ParsedWebhook {
  const events: NormalizedEvent[] = [];
  const effects: SideEffect[] = [];

  const root = rec(body);
  if (root.object !== "instagram") return { events, effects };

  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const rawEntry of entries) {
    const entry = rec(rawEntry);
    const igUserId = str(entry.id) ?? "";
    if (!igUserId) continue;
    const entryTime = toDate(entry.time);

    for (const rawChange of Array.isArray(entry.changes) ? entry.changes : []) {
      const parsed = parseChange(rec(rawChange), igUserId, entryTime);
      if (parsed) {
        if ("type" in parsed) effects.push(parsed);
        else events.push(parsed);
      }
    }

    for (const rawMsg of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const parsed = parseMessaging(rec(rawMsg), igUserId, entryTime);
      if (parsed) {
        if ("type" in parsed) effects.push(parsed);
        else events.push(parsed);
      }
    }
  }

  return { events, effects };
}

// --- changes: comments / live_comments --------------------------------------

function parseChange(
  change: AnyRecord,
  igUserId: string,
  entryTime: Date,
): NormalizedEvent | SideEffect | null {
  const field = str(change.field);
  const value = rec(change.value);

  // Kept although we no longer subscribe to it: the field is not offered on
  // Instagram Login (see WEBHOOK_FIELDS), so this cannot fire today. Parsing it
  // costs nothing and means a payload would be handled rather than dropped if
  // that ever changes.
  if (field === "messaging_policy_enforcement") {
    return {
      type: "policy_enforcement",
      igUserId,
      reason: str(value.reason) ?? str(value.action) ?? "Policy enforcement notice from Meta",
      raw: value,
      at: entryTime,
    };
  }

  if (field !== "comments" && field !== "live_comments") return null;

  const commentId = str(value.id);
  if (!commentId) return null;

  const from = rec(value.from);
  const igsid = str(from.id) ?? str(value.self_ig_scoped_id) ?? "";
  if (!igsid) return null;

  const media = rec(value.media);
  const adId = str(media.ad_id) ?? str(value.ad_id);

  // A comment on a boosted/ads post gets its own trigger kind so an
  // ad-scoped automation can target it specifically.
  const kind: TriggerKind =
    field === "live_comments" ? "LIVE_COMMENT" : adId ? "AD_COMMENT" : "COMMENT";

  return {
    dedupeKey: `comment:${commentId}`,
    igUserId,
    kind,
    igsid,
    username: str(from.username),
    text: str(value.text),
    timestamp: toDate(value.timestamp ?? entryTime),
    commentId,
    parentCommentId: str(value.parent_id),
    mediaId: str(media.id),
    mediaType: str(media.media_product_type) ?? str(media.media_type),
    adId,
    adTitle: str(media.ad_title) ?? str(value.ad_title),
    raw: change,
  };
}

// --- messaging: DMs, story replies/mentions, postbacks, referrals ------------

function parseMessaging(
  msg: AnyRecord,
  igUserId: string,
  entryTime: Date,
): NormalizedEvent | SideEffect | null {
  const sender = rec(msg.sender);
  const igsid = str(sender.id) ?? "";
  const at = toDate(msg.timestamp ?? entryTime);
  if (!igsid) return null;

  // Read receipt — powers the "Opened" metric.
  if (msg.read) {
    return { type: "message_seen", igUserId, igsid, messageId: str(rec(msg.read).mid), at };
  }

  if (msg.reaction) {
    const reaction = rec(msg.reaction);
    return {
      type: "reaction",
      igUserId,
      igsid,
      messageId: str(reaction.mid),
      emoji: str(reaction.emoji),
      action: str(reaction.action),
      at,
    };
  }

  if (msg.optin) {
    return { type: "optin", igUserId, igsid, raw: msg.optin, at };
  }

  // Button / ice-breaker click.
  if (msg.postback) {
    const postback = rec(msg.postback);
    const mid = str(postback.mid) ?? `${igsid}:${at.getTime()}`;
    const payload = str(postback.payload) ?? "";
    return {
      dedupeKey: `postback:${mid}`,
      igUserId,
      // Ice breakers are postbacks we ourselves configured with a known prefix.
      kind: payload.startsWith("ICEBREAKER:") ? "ICE_BREAKER" : "POSTBACK",
      igsid,
      text: str(postback.title),
      payload,
      timestamp: at,
      messageId: mid,
      raw: msg,
    };
  }

  // ig.me / ads referral entry.
  if (msg.referral) {
    const referral = rec(msg.referral);
    return {
      dedupeKey: `referral:${igsid}:${at.getTime()}`,
      igUserId,
      kind: "REFERRAL",
      igsid,
      payload: str(referral.ref),
      adId: str(referral.ad_id),
      timestamp: at,
      raw: msg,
    };
  }

  if (!msg.message) return null;
  const message = rec(msg.message);
  const mid = str(message.mid) ?? `${igsid}:${at.getTime()}`;

  // Our own outbound messages come back as echoes — never a trigger.
  if (message.is_echo === true) {
    return { type: "echo", igUserId, igsid, messageId: mid, text: str(message.text), at };
  }

  const attachments = (Array.isArray(message.attachments) ? message.attachments : []).map((a) => {
    const att = rec(a);
    return { type: str(att.type) ?? "unknown", url: str(rec(att.payload).url) };
  });

  // A story mention arrives as an attachment of type "story_mention".
  const isStoryMention = attachments.some((a) => a.type === "story_mention");
  // A story reply carries reply_to.story.
  const replyToStory = rec(rec(message.reply_to).story);
  const isStoryReply = Boolean(replyToStory.id || replyToStory.url);

  const kind: TriggerKind = isStoryMention
    ? "STORY_MENTION"
    : isStoryReply
      ? "STORY_REPLY"
      : "DM_KEYWORD";

  return {
    dedupeKey: `message:${mid}`,
    igUserId,
    kind,
    igsid,
    text: str(message.text),
    timestamp: at,
    messageId: mid,
    storyId: str(replyToStory.id),
    attachments,
    raw: msg,
  };
}
