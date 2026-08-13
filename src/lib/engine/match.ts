import type { Automation } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { NormalizedEvent } from "@/lib/meta/types";

/**
 * Trigger matching: given a normalised inbound event, decide which automations
 * should fire.
 *
 * This is where LinkDM's "All Comments vs Specific Keywords" and SendDM's
 * "basic vs advanced keyword triggers" live.
 */

// --- Text normalisation -----------------------------------------------------

/**
 * Lowercase, strip accents, collapse whitespace, and drop emoji/punctuation.
 * Keeps letters and digits from any script so non-Latin keywords still work.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance, bounded so a long string can't blow up the loop. */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

export type MatchOptions = {
  matchType: string; // CONTAINS | EXACT | STARTS_WITH | REGEX
  caseSensitive: boolean;
  fuzzy: boolean;
};

/** Does `text` match this single keyword under the given options? */
export function matchesKeyword(text: string, keyword: string, opts: MatchOptions): boolean {
  if (!keyword) return false;

  if (opts.matchType === "REGEX") {
    try {
      return new RegExp(keyword, opts.caseSensitive ? "u" : "iu").test(text);
    } catch {
      return false; // an invalid regex should never fire, and never throw
    }
  }

  const haystack = opts.caseSensitive ? text.trim() : normalizeText(text);
  const needle = opts.caseSensitive ? keyword.trim() : normalizeText(keyword);
  if (!needle) return false;

  switch (opts.matchType) {
    case "EXACT": {
      if (haystack === needle) return true;
      return opts.fuzzy && editDistance(haystack, needle) <= fuzzyBudget(needle);
    }
    case "STARTS_WITH":
      return haystack.startsWith(needle);
    case "CONTAINS":
    default: {
      // Whole-word matching, not raw substring — otherwise the keyword "LINK"
      // fires on someone writing "linkedin", and "SHOP" on "shopping".
      // Normalisation has already stripped punctuation and emoji, so a comment
      // of "LINK!!! 🙏" is just the word "link" by this point.
      if (needle.includes(" ")) return haystack.includes(needle);

      const words = haystack.split(" ");
      if (words.some((word) => word === needle || isElongated(word, needle))) return true;

      if (opts.fuzzy) {
        const budget = fuzzyBudget(needle);
        return words.some((word) => editDistance(word, needle, budget) <= budget);
      }
      return false;
    }
  }
}

/**
 * People type "LINKKK" when they're excited. Treat a word as the keyword when
 * the only difference is the final character repeated — which "linkedin" is
 * not, so the word-boundary guarantee still holds.
 */
function isElongated(word: string, needle: string): boolean {
  if (word.length <= needle.length || !word.startsWith(needle)) return false;
  const lastChar = needle.at(-1);
  return [...word.slice(needle.length)].every((char) => char === lastChar);
}

/** Short words get no typo tolerance — "shop" vs "stop" must not collide. */
function fuzzyBudget(needle: string): number {
  if (needle.length <= 4) return 0;
  if (needle.length <= 8) return 1;
  return 2;
}

export type KeywordDecision = { matched: boolean; keyword?: string; reason?: string };

export function evaluateKeywords(
  text: string | undefined,
  automation: Pick<
    Automation,
    "matchMode" | "keywords" | "negativeKeywords" | "matchType" | "caseSensitive" | "fuzzyMatch"
  >,
): KeywordDecision {
  const opts: MatchOptions = {
    matchType: automation.matchType,
    caseSensitive: automation.caseSensitive,
    fuzzy: automation.fuzzyMatch,
  };

  // Negative keywords veto, even in ALL mode — this is how a creator excludes
  // "how much", "spam", competitor names, etc.
  if (text && automation.negativeKeywords.length) {
    const blocked = automation.negativeKeywords.find((k) =>
      matchesKeyword(text, k, { ...opts, matchType: "CONTAINS" }),
    );
    if (blocked) return { matched: false, reason: `excluded by negative keyword "${blocked}"` };
  }

  // LinkDM's "All Comments" trigger type.
  if (automation.matchMode === "ALL") return { matched: true, reason: "matches all messages" };

  if (!text) return { matched: false, reason: "no text to match against" };
  if (automation.keywords.length === 0) return { matched: false, reason: "no keywords configured" };

  const hit = automation.keywords.find((k) => matchesKeyword(text, k, opts));
  return hit
    ? { matched: true, keyword: hit }
    : { matched: false, reason: "no keyword matched" };
}

// --- Automation selection ---------------------------------------------------

export type MatchResult = { automation: Automation; keyword?: string };

/**
 * Find every automation that should fire for this event, best first.
 *
 * Ordering: explicitly-targeted media beats "all media" beats universal, then
 * the user's own priority, then most recently updated. All matches are returned
 * so the caller can decide (we run the top one per trigger type, which keeps a
 * contact from getting three DMs for one comment).
 */
export async function findMatchingAutomations(
  accountId: string,
  event: NormalizedEvent,
): Promise<MatchResult[]> {
  // An ad comment should also be able to fire ordinary comment automations that
  // are scoped universally — creators expect "all my posts" to include boosts.
  const triggerTypes =
    event.kind === "AD_COMMENT" ? ["AD_COMMENT", "COMMENT"] : [event.kind];

  const candidates = await prisma.automation.findMany({
    where: { accountId, enabled: true, triggerType: { in: triggerTypes } },
    include: { media: { select: { mediaId: true } }, flow: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  const now = new Date();
  const results: Array<MatchResult & { rank: number }> = [];

  for (const automation of candidates) {
    // Active schedule
    if (automation.scheduleStart && automation.scheduleStart > now) continue;
    if (automation.scheduleEnd && automation.scheduleEnd < now) continue;

    // A flow with no steps can't do anything.
    if (!automation.flow) continue;

    // Media scope
    let rank = 0;
    if (automation.scope === "SPECIFIC") {
      if (!event.mediaId) continue;
      const media = await prisma.media.findUnique({
        where: { accountId_igMediaId: { accountId, igMediaId: event.mediaId } },
        select: { id: true },
      });
      if (!media) continue;
      if (!automation.media.some((m) => m.mediaId === media.id)) continue;
      rank = 3;
    } else if (automation.scope === "AD") {
      if (!event.adId) continue;
      rank = 2;
    } else if (automation.scope === "ALL_MEDIA") {
      rank = 1;
    } else {
      // UNIVERSAL — matches anything, including future posts and ads.
      rank = 0;
    }

    // Ice breakers and postbacks match on payload, not free text.
    if (event.kind === "ICE_BREAKER" || event.kind === "POSTBACK") {
      const target = event.payload ?? "";
      // Payload format: "ICEBREAKER:<automationId>" / "NODE:<automationId>:<nodeId>"
      if (!target.includes(automation.id)) continue;
      results.push({ automation, rank: 10 });
      continue;
    }

    const decision = evaluateKeywords(event.text, automation);
    if (!decision.matched) continue;

    results.push({ automation, keyword: decision.keyword, rank });
  }

  return results
    .sort((a, b) => b.rank - a.rank || b.automation.priority - a.automation.priority)
    .map(({ automation, keyword }) => ({ automation, keyword }));
}

/**
 * Per-contact re-entry policy — stops one person from being DMed over and over.
 */
export async function canEnterFlow(
  automation: Automation,
  contactId: string,
  event: NormalizedEvent,
): Promise<{ allowed: boolean; reason?: string }> {
  switch (automation.reentryPolicy) {
    case "ALWAYS":
      return { allowed: true };

    case "ONCE": {
      const previous = await prisma.flowRun.findFirst({
        where: { automationId: automation.id, contactId },
        select: { id: true },
      });
      return previous
        ? { allowed: false, reason: "This contact has already been through this automation." }
        : { allowed: true };
    }

    case "COOLDOWN": {
      const minutes = automation.cooldownMinutes ?? 60;
      const since = new Date(Date.now() - minutes * 60 * 1000);
      const recent = await prisma.flowRun.findFirst({
        where: { automationId: automation.id, contactId, startedAt: { gte: since } },
        select: { id: true },
      });
      return recent
        ? { allowed: false, reason: `Cooldown of ${minutes} minutes hasn't elapsed.` }
        : { allowed: true };
    }

    case "ONCE_PER_MEDIA":
    default: {
      if (!event.mediaId) {
        // No media context (a DM keyword, say) — fall back to a short cooldown
        // so a rapid double-send can't happen.
        const recent = await prisma.flowRun.findFirst({
          where: {
            automationId: automation.id,
            contactId,
            startedAt: { gte: new Date(Date.now() - 60 * 1000) },
          },
          select: { id: true },
        });
        return recent ? { allowed: false, reason: "Just ran for this contact." } : { allowed: true };
      }
      const previous = await prisma.flowRun.findFirst({
        where: {
          automationId: automation.id,
          contactId,
          triggerPayload: { path: ["mediaId"], equals: event.mediaId },
        },
        select: { id: true },
      });
      return previous
        ? { allowed: false, reason: "This contact already triggered this automation on this post." }
        : { allowed: true };
    }
  }
}
