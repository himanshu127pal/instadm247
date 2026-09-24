import { z } from "zod";
import { PRESETS, getPreset } from "@/lib/engine/presets";
import { flowGraphSchema, validateGraph, type FlowGraph } from "@/lib/engine/schema";
import { PlanLimitError, requireNodesAllowed } from "@/lib/plan";

/**
 * Draft automations proposed by the AI Helper. See docs/HELPER.md.
 *
 * The helper never creates anything. It proposes a draft — a starting template
 * plus the customer's own words — and the dashboard shows it as a card. Only
 * when the person presses "Create draft" does the normal POST /api/automations
 * run, with the same checks as the wizard, and the automation is created
 * switched off like every other. So a draft can't reach anyone on Instagram
 * until a person has opened it in the builder and turned it on.
 */

/** Triggers the wizard offers. The helper proposes only from this list. */
export const DRAFT_TRIGGERS = [
  "COMMENT",
  "STORY_REPLY",
  "STORY_MENTION",
  "LIVE_COMMENT",
  "DM_KEYWORD",
  "AD_COMMENT",
  "ICE_BREAKER",
] as const;

const COMMENT_TRIGGERS = new Set(["COMMENT", "LIVE_COMMENT", "AD_COMMENT"]);

/**
 * The customer's words, applied on top of a template. Every field is optional:
 * anything left out keeps the template's own text.
 */
export const customizeSchema = z.object({
  /** Replaces the text of the first DM. */
  starterMessage: z.string().trim().min(1).max(900).optional(),
  /** Replaces the template's placeholder link on every button that uses it. */
  link: z
    .object({
      url: z.string().trim().url().refine((u) => u.startsWith("https://"), "Links must start with https://"),
      title: z.string().trim().min(1).max(20),
    })
    .optional(),
  /** Replaces the public comment replies, where the template has them. */
  publicReplies: z.array(z.string().trim().min(1).max(200)).min(1).max(5).optional(),
});
export type Customize = z.infer<typeof customizeSchema>;

export const draftSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(DRAFT_TRIGGERS),
  matchMode: z.enum(["ALL", "KEYWORD", "REACTION", "REPLY"]),
  keywords: z.array(z.string().trim().min(1).max(40)).max(10),
  scope: z.enum(["ALL_MEDIA", "UNIVERSAL", "AD"]),
  presetId: z.string().min(1),
  customize: customizeSchema.default({}),
});
export type Draft = z.infer<typeof draftSchema>;

/** The placeholder every template's buttons point at until someone changes it. */
const PLACEHOLDER_URL = "https://example.com";

/** The template's graph with the customer's words applied. */
export function buildDraftGraph(presetId: string, customize: Customize): FlowGraph {
  const graph = getPreset(presetId).build();
  const first = graph.nodes.find((n) => n.type === "SEND_MESSAGE");

  for (const node of graph.nodes) {
    if (node.type === "SEND_MESSAGE") {
      const message = node.data.message;
      if (node === first && customize.starterMessage && (message.kind === "text" || message.kind === "buttons")) {
        message.text = customize.starterMessage;
      }
      if (customize.link && message.kind === "buttons") {
        message.buttons = message.buttons.map((b) =>
          b.type === "web_url" && b.url === PLACEHOLDER_URL ? { ...b, url: customize.link!.url, title: customize.link!.title } : b,
        );
      }
    }
    if (node.type === "REPLY_TO_COMMENT" && customize.publicReplies) {
      node.data.replies = customize.publicReplies;
    }
  }
  return graph;
}

/**
 * Everything wrong with a draft, in words the helper can act on. Empty means
 * it can be offered. The same rules as the wizard, plus the ones the wizard
 * leaves to the builder's live validation.
 */
export function checkDraft(workspace: { planKey?: string | null }, draft: Draft): string[] {
  const issues: string[] = [];
  const preset = PRESETS.find((p) => p.id === draft.presetId);
  if (!preset) {
    return [`There's no template "${draft.presetId}". Use one of: ${PRESETS.map((p) => p.id).join(", ")}.`];
  }

  if (draft.matchMode === "KEYWORD" && draft.keywords.length === 0) {
    issues.push("Keyword matching needs at least one keyword.");
  }
  if ((draft.matchMode === "REACTION" || draft.matchMode === "REPLY") && draft.triggerType !== "STORY_REPLY") {
    issues.push("Reaction-only and reply-only matching only exist for story replies.");
  }
  if (draft.scope !== "ALL_MEDIA" && !COMMENT_TRIGGERS.has(draft.triggerType)) {
    issues.push("Choosing which posts only applies to comment triggers; use ALL_MEDIA.");
  }

  const graph = buildDraftGraph(draft.presetId, draft.customize);
  if (!COMMENT_TRIGGERS.has(draft.triggerType) && graph.nodes.some((n) => n.type === "REPLY_TO_COMMENT")) {
    issues.push(
      `The "${preset.name}" template replies publicly to a comment, which a ${draft.triggerType} trigger doesn't have. Pick a template without a public reply.`,
    );
  }
  if (draft.customize.publicReplies && !graph.nodes.some((n) => n.type === "REPLY_TO_COMMENT")) {
    issues.push(`The "${preset.name}" template has no public reply to customise.`);
  }
  if (draft.customize.link && !JSON.stringify(getPreset(draft.presetId).build()).includes(PLACEHOLDER_URL)) {
    issues.push(`The "${preset.name}" template has no link button to customise.`);
  }

  try {
    requireNodesAllowed(workspace, graph.nodes.map((n) => n.type));
  } catch (error) {
    if (error instanceof PlanLimitError) issues.push(error.message);
    else throw error;
  }

  const parsed = flowGraphSchema.safeParse(graph);
  if (!parsed.success) {
    issues.push(`The flow wouldn't be valid: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
  } else {
    for (const issue of validateGraph(parsed.data)) {
      if (issue.level === "error") issues.push(issue.message);
    }
  }
  return issues;
}

/** Human-readable steps of a draft, for the card the dashboard shows. */
export function describeDraft(draft: Draft): string[] {
  const graph = buildDraftGraph(draft.presetId, draft.customize);
  return graph.nodes
    .filter((n) => n.type !== "TRIGGER")
    .map((n) => {
      if (n.type === "SEND_MESSAGE") {
        const m = n.data.message;
        const text = m.kind === "text" || m.kind === "buttons" ? m.text : m.kind;
        return `${n.data.label}: "${text.length > 90 ? `${text.slice(0, 90)}…` : text}"`;
      }
      if (n.type === "REPLY_TO_COMMENT") return `${n.data.label}: ${n.data.replies.map((r) => `"${r}"`).join(" / ")}`;
      return n.data.label;
    });
}
