/**
 * Canonical types for the Instagram integration.
 * Endpoint shapes are documented in docs/META_API.md — check there before
 * changing anything here.
 */

export type IgScope =
  | "instagram_business_basic"
  | "instagram_business_manage_messages"
  | "instagram_business_manage_comments"
  | "instagram_business_content_publish";

export const REQUIRED_SCOPES: IgScope[] = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  // Needed by the content scheduler. Harmless to hold if scheduling is unused,
  // and asking later would mean sending every creator back through OAuth.
  "instagram_business_content_publish",
];

/**
 * Webhook fields we subscribe to. See docs/META_API.md §4.
 *
 * Every entry must appear in the set Instagram Login accepts, which Meta
 * returns verbatim when one does not:
 *
 *   agent_messages, messages, messaging_postbacks, messaging_seen,
 *   messaging_handover, messaging_referral, messaging_optins,
 *   message_reactions, message_edit, standby, comments, live_comments,
 *   mentions, story_insights, creator_marketplace_projects,
 *   creator_marketplace_invited_creator_onboarding, delta, story_reactions,
 *   onboarding_welcome_message_series, follow, comment_poll_response,
 *   story_poll_response, share_to_story
 *
 * `messaging_policy_enforcement` used to be in this list and is not in that
 * set — it belongs to the Messenger/Facebook Login surface, not this one. One
 * invalid name fails the whole subscription, so it took every other field down
 * with it and left connected accounts on comments and messages alone.
 *
 * Note that story mentions do NOT come from `mentions`: they arrive on
 * `messages` as an attachment of type `story_mention`, which is why that
 * feature works without it. `mentions` is caption and comment @mentions, a
 * feature not in docs/FEATURES.md — don't add it without adding the feature.
 */
export const WEBHOOK_FIELDS = [
  "comments",
  "live_comments",
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "messaging_referral",
  "messaging_seen",
  "message_reactions",
  "messaging_handover",
] as const;

/**
 * The fields the product cannot work without: comment triggers and DM triggers.
 *
 * Meta rejects a `subscribed_apps` call outright if any single field in it is
 * not enabled on the app, so an app missing one of the optional fields would
 * otherwise get no webhooks at all. We retry with this set so the core features
 * still run, and record what was dropped.
 */
export const CORE_WEBHOOK_FIELDS = ["comments", "messages"] as const;

export type IgProfile = {
  user_id?: string;
  id?: string;
  username: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
};

export type IgMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
  like_count?: number;
};

/** From `GET /<IGSID>` — `is_user_follow_business` powers the follower gate. */
export type IgUserProfile = {
  name?: string;
  username?: string;
  profile_pic?: string;
  follower_count?: number;
  is_user_follow_business?: boolean;
  is_business_follow_user?: boolean;
};

// --- Outbound message payloads ---------------------------------------------

export type ButtonSpec =
  | { type: "web_url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

export type CarouselSlide = {
  title: string;
  subtitle?: string;
  image_url?: string;
  buttons?: ButtonSpec[];
  default_action?: { type: "web_url"; url: string };
};

export type OutboundMessage =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "audio"; url: string }
  | { kind: "buttons"; text: string; buttons: ButtonSpec[] }
  /** Generic template carousel — Instagram caps this at 10 elements. */
  | { kind: "carousel"; slides: CarouselSlide[] };

export type SendTarget =
  | { to: "user"; igsid: string }
  /** Private reply to a comment — one per comment, ever. docs/META_API.md §5 */
  | { to: "comment"; commentId: string };

// --- Normalised inbound events ---------------------------------------------

export type TriggerKind =
  | "COMMENT"
  | "LIVE_COMMENT"
  | "STORY_REPLY"
  | "STORY_MENTION"
  | "DM_KEYWORD"
  | "ICE_BREAKER"
  | "POSTBACK"
  | "REFERRAL"
  | "AD_COMMENT";

export type NormalizedEvent = {
  /** Idempotency key — comment id or message id. */
  dedupeKey: string;
  igUserId: string;
  kind: TriggerKind;
  /** Instagram-scoped ID of the person who acted. */
  igsid: string;
  username?: string;
  text?: string;
  timestamp: Date;

  commentId?: string;
  parentCommentId?: string;
  mediaId?: string;
  mediaType?: string;
  /** Present when the comment was on a boosted / ads post. */
  adId?: string;
  adTitle?: string;

  messageId?: string;
  /** Postback / ice-breaker payload */
  payload?: string;
  /** Story id when this is a story reply or mention */
  storyId?: string;
  attachments?: Array<{ type: string; url?: string }>;
  raw: unknown;
};

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  /** Rate limited — the dispatcher should back off and arm Slow Down mode. */
  get isRateLimit(): boolean {
    return this.status === 429 || this.code === 4 || this.code === 613 || this.code === 32;
  }

  /** Token is dead — the account must be reconnected. */
  get isAuthError(): boolean {
    return this.status === 401 || this.code === 190 || this.code === 102;
  }

  /**
   * Outside the messaging window, or the comment can no longer be replied to.
   * Not retryable — drop the send and record why.
   *
   * Code 10 on its own is NOT a window error: it is Graph's general
   * "permission denied", and the window is only one of its causes. Treating
   * every code 10 as the window once told people a reply failed because the
   * window had closed when it was wide open. Only the window subcodes, or a
   * code 10 whose text says so, count.
   */
  get isWindowError(): boolean {
    if (this.subcode === 2534022 || this.subcode === 2018278) return true;
    return this.code === 10 && /window|24.?hour|outside of allowed/i.test(this.message);
  }

  /**
   * The app isn't allowed to do this: a permission or feature it hasn't been
   * granted (code 10, or Graph's 200–299 range). Not retryable.
   */
  get isPermissionError(): boolean {
    if (this.isWindowError) return false;
    return this.code === 10 || (this.code !== undefined && this.code >= 200 && this.code <= 299);
  }

  get isRetryable(): boolean {
    return this.isRateLimit || this.status >= 500;
  }
}
