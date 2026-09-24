import { nanoid } from "nanoid";
import type { FlowGraph } from "./schema";

/**
 * Starter flows. A blank canvas is the fastest way to lose someone, so every
 * new automation begins from one of these.
 */

export type Preset = {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  matchMode: "ALL" | "KEYWORD" | "REACTION" | "REPLY";
  keywords: string[];
  build: () => FlowGraph;
};

function id(prefix: string) {
  return `${prefix}_${nanoid(8)}`;
}

/** Trigger → starter DM, the shape every preset builds on. */
function starter(
  message: string,
  cta?: { title: string; url: string },
): { graph: FlowGraph; lastId: string } {
  const triggerId = id("trigger");
  const sendId = id("send");

  const graph: FlowGraph = {
    nodes: [
      {
        id: triggerId,
        type: "TRIGGER",
        position: { x: 0, y: 0 },
        data: { label: "When this happens" },
      },
      {
        id: sendId,
        type: "SEND_MESSAGE",
        position: { x: 0, y: 160 },
        data: {
          label: "Starter DM",
          // Replying privately to the comment is what legitimately opens the thread.
          asPrivateReply: true,
          message: cta
            ? {
                kind: "buttons",
                text: message,
                buttons: [{ type: "web_url", title: cta.title, url: cta.url }],
              }
            : { kind: "text", text: message },
        },
      },
    ],
    edges: [{ id: id("edge"), source: triggerId, target: sendId, sourceHandle: "next" }],
  };

  return { graph, lastId: sendId };
}

function append(
  graph: FlowGraph,
  fromId: string,
  node: FlowGraph["nodes"][number],
  handle = "next",
): string {
  graph.nodes.push(node);
  graph.edges.push({ id: id("edge"), source: fromId, target: node.id, sourceHandle: handle });
  return node.id;
}

export const PRESETS: Preset[] = [
  {
    id: "comment-to-dm",
    name: "Comment to DM",
    description:
      "The classic. Someone comments your keyword, they get the link in their DMs, and you reply publicly so the thread stays alive.",
    triggerType: "COMMENT",
    matchMode: "KEYWORD",
    keywords: ["LINK"],
    build() {
      const { graph, lastId } = starter(
        "Hey {{first_name}}! Here's the link you asked for 👇",
        { title: "Open the link", url: "https://example.com" },
      );

      const replyId = id("reply");
      append(graph, lastId, {
        id: replyId,
        type: "REPLY_TO_COMMENT",
        position: { x: 0, y: 320 },
        data: {
          label: "Reply in the comments",
          replies: ["Just sent it 💌", "Check your DMs! 📩", "In your inbox now ✨"],
        },
      });

      const endId = id("end");
      append(graph, replyId, {
        id: endId,
        type: "END",
        position: { x: 0, y: 480 },
        data: { label: "Done", goal: true },
      });

      return graph;
    },
  },

  {
    id: "follower-growth",
    name: "Follower growth gate",
    description:
      "Deliver the goods to everyone, but nudge the people who don't follow you yet — and skip the ask entirely for those who already do.",
    triggerType: "COMMENT",
    matchMode: "KEYWORD",
    keywords: ["GUIDE"],
    build() {
      const { graph, lastId } = starter("Hey {{first_name}}! Sending that over now 🙌");

      const checkId = id("check");
      append(graph, lastId, {
        id: checkId,
        type: "FOLLOWER_CHECK",
        position: { x: 0, y: 320 },
        data: { label: "Following me?" },
      });

      // Already a follower — straight to the payload.
      const deliverId = id("send");
      append(
        graph,
        checkId,
        {
          id: deliverId,
          type: "SEND_MESSAGE",
          position: { x: -220, y: 480 },
          data: {
            label: "Deliver the guide",
            asPrivateReply: false,
            message: {
              kind: "buttons",
              text: "Here it is — enjoy! 📘",
              buttons: [{ type: "web_url", title: "Get the guide", url: "https://example.com" }],
            },
          },
        },
        "yes",
      );

      // Not following — ask, then deliver either way.
      const askId = id("ask");
      append(
        graph,
        checkId,
        {
          id: askId,
          type: "ASK_FOR_FOLLOW",
          position: { x: 220, y: 480 },
          data: {
            label: "Ask for a follow",
            recheckAfterMinutes: 5,
            message: {
              kind: "text",
              text: "One tiny thing — give me a follow so you don't miss the next one 🙏 Then it's all yours!",
            },
          },
        },
        "no",
      );

      graph.edges.push({ id: id("edge"), source: askId, target: deliverId, sourceHandle: "yes" });
      graph.edges.push({ id: id("edge"), source: askId, target: deliverId, sourceHandle: "no" });

      const endId = id("end");
      append(graph, deliverId, {
        id: endId,
        type: "END",
        position: { x: -220, y: 640 },
        data: { label: "Done", goal: true },
      });

      return graph;
    },
  },

  {
    id: "lead-capture",
    name: "Capture an email",
    description:
      "Ask for their email inside the DM, save it to their contact record, then send the thing you promised.",
    triggerType: "COMMENT",
    matchMode: "KEYWORD",
    keywords: ["FREEBIE"],
    build() {
      const { graph, lastId } = starter(
        "Hey {{first_name}}! Happy to send that over — what's the best email for it?",
      );

      const collectId = id("collect");
      append(graph, lastId, {
        id: collectId,
        type: "COLLECT_INPUT",
        position: { x: 0, y: 320 },
        data: {
          label: "Ask for their email",
          prompt: "Just reply with your email and I'll send it straight over 📧",
          variable: "email",
          fieldType: "email",
          timeoutMinutes: 120,
        },
      });

      const tagId = id("tag");
      append(
        graph,
        collectId,
        {
          id: tagId,
          type: "TAG",
          position: { x: -200, y: 480 },
          data: { label: "Tag as a lead", action: "add", tags: ["lead"] },
        },
        "next",
      );

      const deliverId = id("send");
      append(graph, tagId, {
        id: deliverId,
        type: "SEND_MESSAGE",
        position: { x: -200, y: 640 },
        data: {
          label: "Send the freebie",
          asPrivateReply: false,
          message: {
            kind: "buttons",
            text: "Perfect — sent to {{email}}. Here's the instant link too 👇",
            buttons: [{ type: "web_url", title: "Download now", url: "https://example.com" }],
          },
        },
      });

      const nudgeId = id("send");
      append(
        graph,
        collectId,
        {
          id: nudgeId,
          type: "SEND_MESSAGE",
          position: { x: 240, y: 480 },
          data: {
            label: "Nudge if they went quiet",
            asPrivateReply: false,
            message: {
              kind: "text",
              text: "No rush — reply with your email whenever and I'll fire it over 😊",
            },
          },
        },
        "timeout",
      );

      const endId = id("end");
      append(graph, deliverId, {
        id: endId,
        type: "END",
        position: { x: -200, y: 800 },
        data: { label: "Lead captured", goal: true },
      });

      return graph;
    },
  },

  {
    id: "story-mention-giveaway",
    name: "Story mention giveaway",
    description:
      "\"Share this and tag me to enter.\" Every mention gets an instant confirmation and their entry bonus.",
    triggerType: "STORY_MENTION",
    matchMode: "ALL",
    keywords: [],
    build() {
      const { graph, lastId } = starter(
        "You're in, {{first_name}}! 🎉 Thanks for sharing — winners announced Friday.",
      );

      const tagId = id("tag");
      append(graph, lastId, {
        id: tagId,
        type: "TAG",
        position: { x: 0, y: 320 },
        data: { label: "Tag the entrant", action: "add", tags: ["giveaway-entry"] },
      });

      const delayId = id("delay");
      append(graph, tagId, {
        id: delayId,
        type: "DELAY",
        position: { x: 0, y: 480 },
        data: { label: "Wait 30 minutes", minutes: 30 },
      });

      const bonusId = id("send");
      append(graph, delayId, {
        id: bonusId,
        type: "SEND_MESSAGE",
        position: { x: 0, y: 640 },
        data: {
          label: "Bonus entry",
          asPrivateReply: false,
          message: {
            kind: "buttons",
            text: "Want a second entry? Tag a friend who'd love this 👇",
            buttons: [{ type: "web_url", title: "See the rules", url: "https://example.com" }],
          },
        },
      });

      const endId = id("end");
      append(graph, bonusId, {
        id: endId,
        type: "END",
        position: { x: 0, y: 800 },
        data: { label: "Entered", goal: true },
      });

      return graph;
    },
  },

  {
    id: "story-reaction",
    name: "Thank people who react to your story",
    description:
      "Someone taps an emoji under your story and gets a thank-you DM with your link. Written replies and heart likes don't trigger it.",
    triggerType: "STORY_REPLY",
    matchMode: "REACTION",
    keywords: [],
    build() {
      const { graph, lastId } = starter("Thanks for the love on my story, {{first_name}} 💛 Here's something for you 👇", {
        title: "Open it",
        url: "https://example.com",
      });
      append(graph, lastId, { id: id("end"), type: "END", position: { x: 0, y: 320 }, data: { label: "Sent", goal: true } });
      return graph;
    },
  },

  {
    id: "follow-up-if-no-reply",
    name: "Follow up if they don't reply",
    description:
      "Someone DMs your keyword and gets your answer. If they go quiet, a friendly nudge 4 hours later, and a last one before Instagram's 24-hour window closes. Anyone who replies is left alone.",
    triggerType: "DM_KEYWORD",
    matchMode: "KEYWORD",
    keywords: ["INFO"],
    build() {
      const { graph, lastId } = starter(
        "Hey {{first_name}}! Here's everything you asked about 👇",
        { title: "Take a look", url: "https://example.com" },
      );

      // Each nudge: wait, then carry on only if they haven't replied. Instagram
      // only allows messages within 24 hours of their last message, so the
      // waits add up to 23 hours — and if they never messaged at all (a
      // comment), the dispatcher skips the nudge rather than break the rule.
      const nudge = (from: string, y: number, minutes: number, text: string, label: string) => {
        const waitId = append(graph, from, {
          id: id("delay"),
          type: "DELAY",
          position: { x: 0, y },
          data: { label: `Wait ${minutes / 60}h`, minutes },
        });
        const checkId = append(graph, waitId, {
          id: id("cond"),
          type: "CONDITION",
          position: { x: 0, y: y + 160 },
          data: {
            label: "Did they reply?",
            mode: "all",
            conditions: [{ field: "replied", operator: "is_true" }],
          },
        });
        append(
          graph,
          checkId,
          { id: id("end"), type: "END", position: { x: 260, y: y + 320 }, data: { label: "They replied", goal: true } },
          "yes",
        );
        return append(
          graph,
          checkId,
          { id: id("send"), type: "SEND_MESSAGE", position: { x: 0, y: y + 320 }, data: { label, asPrivateReply: false, message: { kind: "text", text } } },
          "no",
        );
      };

      const first = nudge(lastId, 320, 240, "Did you get a chance to look? Happy to answer anything 🙂", "Nudge 1");
      const second = nudge(first, 800, 1140, "Last one from me — reply here any time if you'd like help ✨", "Nudge 2");

      append(graph, second, { id: id("end"), type: "END", position: { x: 0, y: 1280 }, data: { label: "Done", goal: false } });
      return graph;
    },
  },

  {
    id: "ai-faq",
    name: "AI answers your FAQ",
    description:
      "Someone DMs a question. The AI answers from your knowledge base — and hands it to you the moment it isn't sure.",
    triggerType: "DM_KEYWORD",
    matchMode: "ALL",
    keywords: [],
    build() {
      const triggerId = id("trigger");
      const graph: FlowGraph = {
        nodes: [
          {
            id: triggerId,
            type: "TRIGGER",
            position: { x: 0, y: 0 },
            data: { label: "When someone DMs you" },
          },
        ],
        edges: [],
      };

      const aiId = id("ai");
      append(graph, triggerId, {
        id: aiId,
        type: "AI_REPLY",
        position: { x: 0, y: 160 },
        data: { label: "AI answers", handoffOnUnknown: true },
      });

      const endId = id("end");
      append(graph, aiId, {
        id: endId,
        type: "END",
        position: { x: 0, y: 320 },
        data: { label: "Answered", goal: true },
      });

      return graph;
    },
  },

  {
    id: "blank",
    name: "Start from scratch",
    description: "Just a trigger. Build the rest yourself.",
    triggerType: "COMMENT",
    matchMode: "KEYWORD",
    keywords: [],
    build() {
      const triggerId = id("trigger");
      return {
        nodes: [
          {
            id: triggerId,
            type: "TRIGGER",
            position: { x: 0, y: 0 },
            data: { label: "When this happens" },
          },
        ],
        edges: [],
      };
    },
  },
];

export function getPreset(presetId: string): Preset {
  return PRESETS.find((p) => p.id === presetId) ?? PRESETS.at(-1)!;
}
