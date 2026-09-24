/**
 * Story reactions, follow-ups and the live Inbox, run from e2e-check.ts.
 * See docs/FEATURES.md §C (Reachlee).
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { evaluateKeywords, findMatchingAutomations, isEmojiOnly } from "../src/lib/engine/match";
import { parseWebhook } from "../src/lib/meta/webhooks";
import { evaluateCondition, type RunContext } from "../src/lib/engine/run";
import { listConversations } from "../src/lib/inbox";
import { getPreset } from "../src/lib/engine/presets";
import { cumulativeDelayMinutes, flowGraphSchema } from "../src/lib/engine/schema";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

const base = {
  keywords: [] as string[],
  negativeKeywords: [] as string[],
  matchType: "CONTAINS",
  caseSensitive: false,
  fuzzyMatch: false,
};

export async function runParityChecks(prisma: PrismaClient, check: Check, section: Section) {
  // --- Story reactions ------------------------------------------------------

  section("Story reactions");

  check(
    "a single emoji, a skin tone, a family and a flag all read as reactions",
    ["🔥", "❤️", "👍🏽", "👨‍👩‍👧", "🇮🇳", " 😂😂 "].every(isEmojiOnly),
  );
  check("words, or words with an emoji, are not", !isEmojiOnly("love this 🔥") && !isEmojiOnly("ok") && !isEmojiOnly(""));

  const reaction = { ...base, matchMode: "REACTION" };
  const written = { ...base, matchMode: "REPLY" };
  check("REACTION fires on an emoji-only reply", evaluateKeywords("🔥", reaction).matched);
  check("REACTION ignores a written reply", !evaluateKeywords("where do I buy?", reaction).matched);
  check("REPLY fires on a written reply", evaluateKeywords("where do I buy?", written).matched);
  check("REPLY ignores an emoji-only reaction", !evaluateKeywords("😍", written).matched);
  check(
    "negative keywords still veto a written reply",
    !evaluateKeywords("spam link here", { ...written, negativeKeywords: ["spam"] }).matched,
  );

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({ data: { name: `e2e parity ${tag}`, slug: `e2e-parity-${tag}` } });
  const account = await prisma.instagramAccount.create({
    data: { workspaceId: workspace.id, igUserId: `e2e_par_ig_${tag}`, username: `e2e_par_${tag}`, status: "demo" },
  });

  try {
    const [onReaction, onReply] = await Promise.all(
      (["REACTION", "REPLY"] as const).map((matchMode) =>
        prisma.automation.create({
          data: {
            accountId: account.id, name: `e2e ${matchMode}`, triggerType: "STORY_REPLY", matchMode, scope: "ALL_MEDIA",
            // The matcher skips an automation with no flow — it couldn't do anything.
            flow: { create: {} },
          },
        }),
      ),
    );

    // A story reaction as Instagram delivers it: a message replying to a story,
    // whose text is just the emoji.
    const storyReply = (text: string) =>
      parseWebhook({
        object: "instagram",
        entry: [
          {
            id: account.igUserId,
            time: Date.now(),
            messaging: [
              {
                sender: { id: `e2e_par_fan_${tag}` },
                recipient: { id: account.igUserId },
                timestamp: Date.now(),
                message: {
                  mid: `e2e_par_mid_${randomBytes(4).toString("hex")}`,
                  text,
                  reply_to: { story: { id: "e2e_story", url: "https://cdn.example/story.jpg" } },
                },
              },
            ],
          },
        ],
      }).events[0];

    const reacted = storyReply("🔥");
    check("an emoji story reply arrives as a story reply", reacted?.kind === "STORY_REPLY");
    if (reacted) {
      const hits = await findMatchingAutomations(account.id, reacted);
      check(
        "a reaction fires the reaction automation, not the written-reply one",
        hits.some((h) => h.automation.id === onReaction.id) && !hits.some((h) => h.automation.id === onReply.id),
      );
    }
    const typed = storyReply("how much is this?");
    if (typed) {
      const hits = await findMatchingAutomations(account.id, typed);
      check(
        "a written reply fires the written-reply automation, not the reaction one",
        hits.some((h) => h.automation.id === onReply.id) && !hits.some((h) => h.automation.id === onReaction.id),
      );
    }

    // --- Follow-ups ---------------------------------------------------------

    section("Follow up if no reply");

    const preset = getPreset("follow-up-if-no-reply");
    const graph = flowGraphSchema.parse(preset.build());
    check("the follow-up template's waits fit inside Instagram's 24-hour window", cumulativeDelayMinutes(graph) <= 1440);
    check(
      "each nudge is guarded by a 'did they reply?' check",
      graph.nodes.filter((n) => n.type === "CONDITION").length === 2 &&
        graph.nodes
          .filter((n) => n.type === "CONDITION")
          .every((n) => n.type === "CONDITION" && n.data.conditions[0]?.field === "replied"),
    );

    const contact = await prisma.contact.create({
      data: { accountId: account.id, igsid: `e2e_par_contact_${tag}`, lastInteractionAt: new Date() },
    });
    const conversation = await prisma.conversation.create({
      data: { accountId: account.id, contactId: contact.id, lastMessageAt: new Date() },
    });
    const run = await prisma.flowRun.create({
      data: {
        accountId: account.id,
        automationId: onReply.id,
        contactId: contact.id,
        conversationId: conversation.id,
        triggerType: "DM_KEYWORD",
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60 * 1000);
    const message = (direction: "inbound" | "outbound", minutesAgo: number, withRun: boolean) =>
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          contactId: contact.id,
          direction,
          kind: "text",
          text: direction,
          source: "automation",
          status: direction === "outbound" ? "sent" : "delivered",
          flowRunId: withRun ? run.id : null,
          createdAt: at(minutesAgo),
        },
      });

    const ctx = { run, contact } as unknown as RunContext;
    const replied = () => evaluateCondition(ctx, { field: "replied", operator: "is_true" });

    await message("inbound", 60, false); // the keyword that started the run
    await message("outbound", 59, true); // our answer
    check("the message that started the flow doesn't count as a reply", !(await replied()));
    await message("inbound", 30, false);
    check("a message after our answer does", await replied());
    await message("outbound", 10, true); // a nudge went out after their reply
    check("it's measured from our latest message, so the next nudge waits for a new reply", !(await replied()));

    // --- Live Inbox ---------------------------------------------------------

    section("Live Inbox");

    const before = new Date();
    await new Promise((r) => setTimeout(r, 20));
    check("nothing changed yet, nothing returned", (await listConversations(workspace.id, before)).length === 0);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: { increment: 1 }, lastMessagePreview: "hello?" },
    });
    const changed = await listConversations(workspace.id, before);
    check(
      "a conversation with a new message comes back, with its unread count",
      changed.length === 1 && changed[0].id === conversation.id && changed[0].unreadCount === 1,
    );
    const other = await prisma.workspace.create({ data: { name: `e2e other ${tag}`, slug: `e2e-par-other-${tag}` } });
    check("another workspace never sees it", (await listConversations(other.id, before)).length === 0);
    await prisma.workspace.delete({ where: { id: other.id } });
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
}
