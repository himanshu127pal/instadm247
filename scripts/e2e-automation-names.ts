/**
 * The name a new automation starts with. Run from e2e-check.ts.
 *
 * Every comment automation used to start as "Comment to DM: LINK", so three
 * automations on three posts were indistinguishable on the list.
 */

import { describePost, suggestAutomationName, type NameInput } from "../src/lib/automation-name";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

export function runAutomationNameChecks(check: Check, section: Section) {
  section("New automations: a name that tells them apart");
  const base: NameInput = { triggerType: "COMMENT", matchMode: "KEYWORD", keywords: ["LINK"], scope: "ALL_MEDIA", posts: [], timeZone: "UTC" };
  const post = (caption: string | null) => ({ caption, timestamp: "2026-10-02T12:00:00Z" });
  const name = (over: Partial<NameInput>) => suggestAutomationName({ ...base, ...over });

  check("one post is named by its caption and date", name({ scope: "SPECIFIC", posts: [post("New drop is live 🔥\nLink in bio")] }) === "LINK · New drop is live 🔥 (Oct 2)", name({ scope: "SPECIFIC", posts: [post("New drop is live 🔥\nLink in bio")] }));
  check("so two posts with the same keyword get different names", name({ scope: "SPECIFIC", posts: [post("Summer sale")] }) !== name({ scope: "SPECIFIC", posts: [post("Winter sale")] }));
  check("a long caption is cut at a word", describePost(post("This is a really long caption about my brand new course"), "UTC") === "This is a really long… (Oct 2)", describePost(post("This is a really long caption about my brand new course"), "UTC"));
  check("hashtags and mentions are left out", describePost(post("#ad Giveaway time @friend"), "UTC") === "Giveaway time (Oct 2)", describePost(post("#ad Giveaway time @friend"), "UTC"));
  check("no caption: the date", describePost(post(null), "UTC") === "post from Oct 2");
  check("several posts: how many", name({ scope: "SPECIFIC", posts: [post("a"), post("b"), post("c")] }) === "LINK · 3 posts");
  check("all posts", name({}) === "LINK · all posts");
  check("more keywords are counted", name({ keywords: ["LINK", "SEND", "INFO"] }) === "LINK +2 · all posts");
  check("no keyword: says so", name({ matchMode: "ALL", keywords: [] }) === "Any comment · all posts");
  check("story reactions", name({ triggerType: "STORY_REPLY", matchMode: "REACTION", keywords: [] }) === "Reactions · stories");
  check("DM keywords", name({ triggerType: "DM_KEYWORD", keywords: ["PRICE"] }) === "PRICE · DMs");
}
