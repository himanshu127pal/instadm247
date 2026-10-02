/**
 * My content: which automation answers on a post, and live stories. Run from
 * e2e-check.ts. The ranking must be the matcher's own, or the page would show
 * one automation winning while another actually runs.
 */

import { listenersForPost, listenersForStories, storyIsLive, type ListenerAutomation } from "../src/lib/content";
import { scopeRank } from "../src/lib/engine/match";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

let n = 0;
function auto(over: Partial<ListenerAutomation>): ListenerAutomation {
  n++;
  return {
    id: `a${n}`, name: `A${n}`, enabled: true, triggerType: "COMMENT", scope: "ALL_MEDIA", priority: 0,
    updatedAt: new Date(Date.UTC(2026, 9, 1, 0, n)), matchMode: "KEYWORD", keywords: ["LINK"], negativeKeywords: [],
    matchType: "CONTAINS", caseSensitive: false, fuzzyMatch: false, mediaIds: [], ...over,
  } as ListenerAutomation;
}

export function runMyContentChecks(check: Check, section: Section) {
  section("My content: who answers on a post");
  check("picked posts outrank ads, all posts and everything", (scopeRank("SPECIFIC", { onPost: true, isAd: false }) ?? -1) > (scopeRank("AD", { onPost: false, isAd: true }) ?? -1) && (scopeRank("AD", { onPost: false, isAd: true }) ?? -1) > (scopeRank("ALL_MEDIA", { onPost: false, isAd: false }) ?? -1));
  check("a picked-posts automation doesn't cover other posts", scopeRank("SPECIFIC", { onPost: false, isAd: false }) === null);

  const general = auto({ name: "LINK on all posts" });
  const specific = auto({ name: "LINK on this post", scope: "SPECIFIC", mediaIds: ["p1"], updatedAt: new Date(Date.UTC(2026, 0, 1)) });
  const onPost = listenersForPost([general, specific], { id: "p1", isAd: false });
  check("on its post, the picked-posts automation is listed first", onPost[0].automation.id === specific.id && onPost.length === 2);
  check("and the all-posts one is shown as never running there", onPost[1].shadowedBy?.id === specific.id);
  const elsewhere = listenersForPost([general, specific], { id: "p2", isAd: false });
  check("on another post, only the all-posts one answers", elsewhere.length === 1 && elsewhere[0].automation.id === general.id && !elsewhere[0].shadowedBy);

  const older = auto({ name: "older", updatedAt: new Date(Date.UTC(2026, 0, 1)) });
  const newer = auto({ name: "newer", updatedAt: new Date(Date.UTC(2026, 5, 1)) });
  const tie = listenersForPost([older, newer], { id: "p1", isAd: false });
  check("between equals, the most recently edited answers first", tie[0].automation.id === newer.id && tie[1].shadowedBy?.id === newer.id);

  const paused = auto({ name: "paused winner", scope: "SPECIFIC", mediaIds: ["p1"], enabled: false });
  const live = listenersForPost([paused, general], { id: "p1", isAd: false });
  check("a paused automation doesn't block the one under it", live[0].automation.id === paused.id && live[1].shadowedBy === null);

  const multi = auto({ name: "LINK or PRICE", keywords: ["LINK", "PRICE"], updatedAt: new Date(Date.UTC(2026, 0, 1)) });
  const partly = listenersForPost([general, multi], { id: "p1", isAd: false }).find((l) => l.automation.id === multi.id)!;
  check("one sharing only some keywords is flagged for those", partly.shadowedBy === null && partly.partlyShadowed.map((p) => p.keyword).join() === "LINK");

  const everyone = auto({ name: "every comment", matchMode: "ALL", keywords: [], scope: "UNIVERSAL" });
  const both = listenersForPost([general, everyone], { id: "p1", isAd: false });
  check("an every-comment automation under a keyword one still answers other comments", both.find((l) => l.automation.id === everyone.id)?.shadowedBy === null);

  const adOnly = auto({ name: "ads", scope: "AD" });
  check("ads-only automations show only on ads", listenersForPost([adOnly], { id: "p1", isAd: false }).length === 0 && listenersForPost([adOnly], { id: "p1", isAd: true }).length === 1);
  check("story automations aren't listed on posts", listenersForPost([auto({ triggerType: "STORY_REPLY" })], { id: "p1", isAd: false }).length === 0);

  section("My content: stories");
  const now = Date.UTC(2026, 9, 2, 12);
  check("a story from 3 hours ago is live", storyIsLive(new Date(now - 3 * 3_600_000), now));
  check("one from 25 hours ago isn't shown", !storyIsLive(new Date(now - 25 * 3_600_000), now));
  const stories = listenersForStories([auto({ triggerType: "STORY_REPLY", enabled: false, name: "off" }), auto({ triggerType: "STORY_REPLY", name: "on" }), general]);
  check("story-reply automations are listed for stories, live ones first", stories.length === 2 && stories[0].name === "on");
}
