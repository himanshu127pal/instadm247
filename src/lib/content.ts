import type { Automation } from "@prisma/client";
import { evaluateKeywords, scopeRank } from "@/lib/engine/match";

/**
 * Which automations listen on a post, in the order they'd win. Powers the
 * Content page. Uses the same ranking as the live matcher (scopeRank, then
 * priority, then most recently edited), so what it shows is what runs.
 */

export type ListenerAutomation = Pick<
  Automation,
  | "id"
  | "name"
  | "enabled"
  | "triggerType"
  | "scope"
  | "priority"
  | "updatedAt"
  | "matchMode"
  | "keywords"
  | "negativeKeywords"
  | "matchType"
  | "caseSensitive"
  | "fuzzyMatch"
> & { mediaIds: string[] };

export type Listener = {
  automation: ListenerAutomation;
  /**
   * A live automation that answers first for every word this one listens
   * for, so this one never runs on this post.
   */
  shadowedBy: { id: string; name: string } | null;
  /** Answers first for some of its keywords (listed), not all. */
  partlyShadowed: Array<{ keyword: string; by: { id: string; name: string } }>;
};

/** The automations that would answer a comment on this post, best first. */
export function listenersForPost(
  automations: ListenerAutomation[],
  post: { id: string; isAd: boolean },
): Listener[] {
  const triggers = post.isAd ? ["COMMENT", "AD_COMMENT"] : ["COMMENT"];
  const ranked = automations
    .filter((a) => triggers.includes(a.triggerType))
    .map((a) => ({ a, rank: scopeRank(a.scope, { onPost: a.mediaIds.includes(post.id), isAd: post.isAd }) }))
    .filter((x): x is { a: ListenerAutomation; rank: number } => x.rank !== null)
    .sort((x, y) => y.rank - x.rank || y.a.priority - x.a.priority || y.a.updatedAt.getTime() - x.a.updatedAt.getTime())
    .map((x) => x.a);

  return ranked.map((automation, index) => {
    const above = ranked.slice(0, index).filter((a) => a.enabled);
    const answersFirst = (text: string) => above.find((a) => evaluateKeywords(text, a).matched) ?? null;

    if (automation.matchMode !== "KEYWORD" || automation.keywords.length === 0) {
      // Listens to every comment: shadowed only by another that does too.
      const all = above.find((a) => a.matchMode !== "KEYWORD" || a.keywords.length === 0) ?? null;
      return { automation, shadowedBy: all && { id: all.id, name: all.name }, partlyShadowed: [] };
    }

    const hits = automation.keywords.map((keyword) => ({ keyword, by: answersFirst(keyword) }));
    const covered = hits.filter((h): h is { keyword: string; by: ListenerAutomation } => h.by !== null);
    if (covered.length === hits.length) {
      const by = covered[0].by;
      return { automation, shadowedBy: { id: by.id, name: by.name }, partlyShadowed: [] };
    }
    return {
      automation,
      shadowedBy: null,
      partlyShadowed: covered.map((h) => ({ keyword: h.keyword, by: { id: h.by.id, name: h.by.name } })),
    };
  });
}

/** Story-reply automations: Instagram doesn't say which story a reply is to in a way we scope by, so these cover every story. */
export function listenersForStories(automations: ListenerAutomation[]): ListenerAutomation[] {
  return automations
    .filter((a) => a.triggerType === "STORY_REPLY")
    .sort((x, y) => Number(y.enabled) - Number(x.enabled) || y.priority - x.priority || y.updatedAt.getTime() - x.updatedAt.getTime());
}

/** A story is live for 24 hours from when it was posted. */
export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function storyIsLive(timestamp: string | Date | null | undefined, now = Date.now()): boolean {
  if (!timestamp) return true; // Instagram only returns live ones; trust it if undated.
  return now - new Date(timestamp).getTime() < STORY_LIFETIME_MS;
}
