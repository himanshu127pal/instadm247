import { env, isInstagramConfigured } from "@/lib/env";
import {
  MetaApiError,
  type IgMedia,
  type IgProfile,
  type IgUserProfile,
  type OutboundMessage,
  type SendTarget,
  WEBHOOK_FIELDS,
} from "./types";

const GRAPH = "https://graph.instagram.com";

/**
 * Thin, typed wrapper over the Instagram Graph API.
 *
 * IMPORTANT: nothing outside src/lib/engine/dispatch.ts may call `sendMessage`
 * directly — the dispatcher is what enforces the messaging window, per-comment
 * dedupe, rate limits and Slow Down mode.
 */
export class InstagramClient {
  constructor(
    private readonly accessToken: string,
    private readonly igUserId: string,
  ) {}

  private url(path: string, params: Record<string, string | undefined> = {}): string {
    const url = new URL(`${GRAPH}/${env.meta.apiVersion}${path}`);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    return url.toString();
  }

  private async request<T>(
    path: string,
    init: { method?: string; params?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    if (!isInstagramConfigured()) {
      throw new MetaApiError(
        "Instagram is not configured on this server (META_APP_ID / META_APP_SECRET missing).",
        503,
      );
    }

    const res = await fetch(this.url(path, init.params), {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const err = (json as { error?: Record<string, unknown> })?.error ?? {};
      throw new MetaApiError(
        String(err.message ?? `Instagram API error (${res.status})`),
        res.status,
        typeof err.code === "number" ? err.code : undefined,
        typeof err.error_subcode === "number" ? err.error_subcode : undefined,
        typeof err.fbtrace_id === "string" ? err.fbtrace_id : undefined,
      );
    }
    return json as T;
  }

  // --- Account ------------------------------------------------------------

  getProfile(): Promise<IgProfile> {
    return this.request<IgProfile>("/me", {
      params: {
        fields:
          "user_id,username,name,account_type,profile_picture_url,followers_count,media_count",
      },
    });
  }

  async getMedia(limit = 50): Promise<IgMedia[]> {
    const res = await this.request<{ data?: IgMedia[] }>("/me/media", {
      params: {
        fields:
          "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
        limit: String(limit),
      },
    });
    return res.data ?? [];
  }

  /**
   * Profile of a person who messaged us. `is_user_follow_business` is what the
   * Follower Growth Tool and Ask-for-Follow gate branch on.
   */
  getUserProfile(igsid: string): Promise<IgUserProfile> {
    return this.request<IgUserProfile>(`/${igsid}`, {
      params: {
        fields: "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user",
      },
    });
  }

  // --- Messaging ----------------------------------------------------------

  /**
   * Send a message. Called ONLY by the dispatcher.
   *
   * `humanAgent` attaches the HUMAN_AGENT tag, which extends the window to 7
   * days. Meta prohibits it on automated messages and detects misuse — it must
   * only ever be true for text a real person typed in the Inbox.
   */
  async sendMessage(
    target: SendTarget,
    message: OutboundMessage,
    opts: { humanAgent?: boolean } = {},
  ): Promise<{ message_id?: string; recipient_id?: string; id?: string }> {
    const recipient =
      target.to === "comment" ? { comment_id: target.commentId } : { id: target.igsid };

    const body: Record<string, unknown> = {
      recipient,
      message: buildMessagePayload(message),
    };
    if (opts.humanAgent) {
      body.messaging_type = "MESSAGE_TAG";
      body.tag = "HUMAN_AGENT";
    }

    return this.request(`/${this.igUserId}/messages`, { method: "POST", body });
  }

  /**
   * Public reply in the comment thread. Separate API surface from private
   * replies and does not consume the one-private-reply-per-comment allowance.
   */
  replyToComment(commentId: string, message: string): Promise<{ id: string }> {
    return this.request(`/${commentId}/replies`, {
      method: "POST",
      body: { message },
    });
  }

  hideComment(commentId: string, hide: boolean): Promise<{ success: boolean }> {
    return this.request(`/${commentId}`, { method: "POST", body: { hide } });
  }

  /**
   * Existing comments on a piece of media. Used by Rewind to find people who
   * commented before an automation existed.
   */
  async getComments(igMediaId: string, limit = 100) {
    const res = await this.request<{
      data?: Array<{
        id: string;
        text?: string;
        timestamp?: string;
        username?: string;
        from?: { id?: string; username?: string };
      }>;
    }>(`/${igMediaId}/comments`, {
      params: { fields: "id,text,timestamp,username,from", limit: String(limit) },
    });
    return res.data ?? [];
  }

  // --- Conversations ------------------------------------------------------

  async getConversations(limit = 50) {
    const res = await this.request<{ data?: Array<{ id: string; updated_time?: string }> }>(
      "/me/conversations",
      { params: { fields: "id,updated_time", limit: String(limit) } },
    );
    return res.data ?? [];
  }

  async getConversationMessages(conversationId: string, limit = 50) {
    const res = await this.request<{
      messages?: { data?: Array<{ id: string; created_time?: string; from?: { id: string }; message?: string }> };
    }>(`/${conversationId}`, {
      params: { fields: `messages.limit(${limit}){id,created_time,from,to,message}` },
    });
    return res.messages?.data ?? [];
  }

  // --- Content publishing -------------------------------------------------

  /**
   * Step 1 of publishing: create a media container. Instagram then downloads
   * and transcodes the file asynchronously — poll `getContainerStatus` before
   * publishing. Requires `instagram_business_content_publish`.
   */
  createMediaContainer(input: {
    mediaType: "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL";
    url?: string;
    caption?: string;
    thumbUrl?: string;
    isCarouselItem?: boolean;
    children?: string[];
  }): Promise<{ id: string }> {
    const body: Record<string, unknown> = {};

    if (input.mediaType === "CAROUSEL") {
      body.media_type = "CAROUSEL";
      body.children = input.children;
    } else if (input.mediaType === "IMAGE") {
      body.image_url = input.url;
    } else {
      // Reels and video both upload as video; media_type distinguishes them.
      body.media_type = input.mediaType;
      body.video_url = input.url;
      if (input.thumbUrl) body.thumb_offset = 0;
    }

    if (input.caption) body.caption = input.caption;
    if (input.isCarouselItem) body.is_carousel_item = true;

    return this.request(`/${this.igUserId}/media`, { method: "POST", body });
  }

  /** Step 2: how far along is Instagram with that container? */
  getContainerStatus(creationId: string): Promise<{ status_code?: string; status?: string }> {
    return this.request(`/${creationId}`, { params: { fields: "status_code,status" } });
  }

  /** Step 3: publish it for real. */
  publishMediaContainer(creationId: string): Promise<{ id: string }> {
    return this.request(`/${this.igUserId}/media_publish`, {
      method: "POST",
      body: { creation_id: creationId },
    });
  }

  // --- Profile configuration ---------------------------------------------

  /** Ice breakers = LinkDM's "Inbox Conversation Starters". Max 5, 80 chars. */
  setIceBreakers(items: Array<{ question: string; payload: string }>): Promise<unknown> {
    return this.request("/me/messenger_profile", {
      method: "POST",
      body: {
        platform: "instagram",
        ice_breakers: [{ locale: "default", call_to_actions: items.slice(0, 5) }],
      },
    });
  }

  setPersistentMenu(
    items: Array<{ type: "web_url" | "postback"; title: string; url?: string; payload?: string }>,
  ): Promise<unknown> {
    return this.request("/me/messenger_profile", {
      method: "POST",
      body: {
        platform: "instagram",
        persistent_menu: [
          { locale: "default", composer_input_disabled: false, call_to_actions: items },
        ],
      },
    });
  }

  deleteMessengerProfile(fields: string[]): Promise<unknown> {
    return this.request("/me/messenger_profile", {
      method: "DELETE",
      body: { platform: "instagram", fields },
    });
  }

  // --- Webhooks -----------------------------------------------------------

  subscribeWebhooks(): Promise<{ success: boolean }> {
    return this.request(`/${this.igUserId}/subscribed_apps`, {
      method: "POST",
      params: { subscribed_fields: WEBHOOK_FIELDS.join(",") },
    });
  }

  unsubscribeWebhooks(): Promise<{ success: boolean }> {
    return this.request(`/${this.igUserId}/subscribed_apps`, { method: "DELETE" });
  }
}

/** Translate our `OutboundMessage` union into Graph API message JSON. */
export function buildMessagePayload(message: OutboundMessage): Record<string, unknown> {
  switch (message.kind) {
    case "text":
      // Docs: text is capped at 1000 bytes UTF-8.
      return { text: truncateBytes(message.text, 1000) };

    case "image":
    case "video":
    case "audio":
      return {
        attachment: {
          type: message.kind,
          payload: { url: message.url, is_reusable: true },
        },
      };

    case "buttons":
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: truncateBytes(message.text, 640),
            buttons: message.buttons.slice(0, 3),
          },
        },
      };

    case "carousel":
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            // Instagram's hard cap — and exactly LinkDM's "up to 10 slides".
            elements: message.slides.slice(0, 10).map((s) => ({
              title: s.title.slice(0, 80),
              subtitle: s.subtitle?.slice(0, 80),
              image_url: s.image_url,
              default_action: s.default_action,
              buttons: s.buttons?.slice(0, 3),
            })),
          },
        },
      };
  }
}

/** Instagram limits are in bytes, not characters — emoji make this matter. */
export function truncateBytes(input: string, maxBytes: number): string {
  const buf = Buffer.from(input, "utf8");
  if (buf.length <= maxBytes) return input;
  let end = maxBytes;
  // Don't slice through a multi-byte sequence.
  while (end > 0 && (buf[end] & 0b1100_0000) === 0b1000_0000) end--;
  return buf.subarray(0, end).toString("utf8");
}
