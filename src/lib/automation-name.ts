/**
 * The name a new automation starts with: what it listens for, and where.
 *
 *   LINK · New drop is live 🔥 (Oct 2)
 *   LINK +2 · 3 posts
 *   Any comment · all posts
 *   Reactions · stories
 *
 * People rarely rename, so the default has to tell automations apart on its
 * own, and naming the post is what does that. Shared by the wizard (browser)
 * and tests; no server imports.
 */

export type NameInput = {
  triggerType: string;
  matchMode: string;
  keywords: string[];
  /** SPECIFIC | ALL_MEDIA | AD | UNIVERSAL; only meaningful for post triggers. */
  scope: string;
  /** The picked posts, when scope is SPECIFIC. */
  posts: Array<{ caption: string | null; timestamp: string | Date | null }>;
  /** For tests: the zone dates are written in. Defaults to the browser's. */
  timeZone?: string;
};

const POST_TRIGGERS = new Set(["COMMENT", "LIVE_COMMENT", "AD_COMMENT"]);

const WHERE_FOR_TRIGGER: Record<string, string> = {
  STORY_REPLY: "stories",
  STORY_MENTION: "story mentions",
  DM_KEYWORD: "DMs",
  ICE_BREAKER: "conversation starters",
  LIVE_COMMENT: "Live",
};

export function suggestAutomationName(input: NameInput): string {
  return `${what(input)} · ${where(input)}`;
}

function what({ triggerType, matchMode, keywords }: NameInput): string {
  if (matchMode === "KEYWORD" && keywords.length) {
    return keywords.length > 1 ? `${keywords[0]} +${keywords.length - 1}` : keywords[0];
  }
  if (matchMode === "REACTION") return "Reactions";
  if (matchMode === "REPLY") return "Written replies";
  const any: Record<string, string> = {
    COMMENT: "Any comment",
    AD_COMMENT: "Any ad comment",
    LIVE_COMMENT: "Any Live comment",
    STORY_REPLY: "Any story reply",
    STORY_MENTION: "Any mention",
    DM_KEYWORD: "Any DM",
    ICE_BREAKER: "Any starter",
  };
  return any[triggerType] ?? "Everything";
}

function where(input: NameInput): string {
  if (!POST_TRIGGERS.has(input.triggerType)) return WHERE_FOR_TRIGGER[input.triggerType] ?? "Instagram";
  if (input.triggerType === "LIVE_COMMENT") return "Live";
  switch (input.scope) {
    case "SPECIFIC":
      if (input.posts.length === 1) return describePost(input.posts[0], input.timeZone);
      return input.posts.length > 1 ? `${input.posts.length} posts` : "selected posts";
    case "AD":
      return "ads";
    case "UNIVERSAL":
      return "everything";
    default:
      return input.triggerType === "AD_COMMENT" ? "all ads" : "all posts";
  }
}

/** "New drop is live 🔥 (Oct 2)", or "post from Oct 2" with no caption. */
export function describePost(post: { caption: string | null; timestamp: string | Date | null }, timeZone?: string): string {
  const date = post.timestamp
    ? new Date(post.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) })
    : null;
  const words = (post.caption ?? "")
    .split("\n")[0]
    // Hashtags and @mentions make poor names; the words around them don't.
    .replace(/[#@][\p{L}\p{N}_.]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return date ? `post from ${date}` : "a post";
  const short = words.length > 28 ? `${words.slice(0, 27).replace(/\s+\S*$/, "") || words.slice(0, 27)}…` : words;
  return date ? `${short} (${date})` : short;
}
