import { z } from "zod";

/**
 * The flow graph schema — the contract between the visual builder and the
 * execution engine.
 *
 * To add a node type: extend `flowNodeSchema` here, add an executor in
 * `src/lib/engine/nodes/`, and add a card in `src/components/flow/nodes/`.
 * Nothing else needs to change.
 */

export const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("web_url"), title: z.string().min(1).max(20), url: z.string().url() }),
  z.object({
    type: z.literal("postback"),
    title: z.string().min(1).max(20),
    payload: z.string().min(1),
  }),
]);

export const carouselSlideSchema = z.object({
  title: z.string().min(1).max(80),
  subtitle: z.string().max(80).optional(),
  image_url: z.string().url().optional(),
  buttons: z.array(buttonSchema).max(3).optional(),
});

/** A message the flow can send. Mirrors OutboundMessage in src/lib/meta/types. */
export const messagePayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
  z.object({ kind: z.literal("image"), url: z.string().url() }),
  z.object({ kind: z.literal("video"), url: z.string().url() }),
  z.object({ kind: z.literal("audio"), url: z.string().url() }),
  z.object({
    kind: z.literal("buttons"),
    text: z.string().min(1),
    buttons: z.array(buttonSchema).min(1).max(3),
  }),
  z.object({
    kind: z.literal("carousel"),
    // Instagram's generic template caps at 10 elements.
    slides: z.array(carouselSlideSchema).min(1).max(10),
  }),
]);

export type MessagePayload = z.infer<typeof messagePayloadSchema>;

const position = z.object({ x: z.number(), y: z.number() });

const base = { id: z.string().min(1), position };

/** Condition operands available to the CONDITION node. */
export const conditionSchema = z.object({
  field: z.enum([
    "is_follower",
    "has_tag",
    "custom_field",
    "variable",
    "message_text",
    "hour_of_day",
    "is_first_time",
  ]),
  operator: z.enum([
    "is_true",
    "is_false",
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "greater_than",
    "less_than",
    "exists",
    "not_exists",
  ]),
  key: z.string().optional(),
  value: z.string().optional(),
});

export const formFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "email", "phone", "number", "choice", "rating"]),
  required: z.boolean().default(true),
  options: z.array(z.string()).optional(),
  /** For QUIZ forms — the option index that scores a point. */
  correctIndex: z.number().int().optional(),
});

export const flowNodeSchema = z.discriminatedUnion("type", [
  /** Entry point. Exactly one per flow. */
  z.object({
    ...base,
    type: z.literal("TRIGGER"),
    data: z.object({ label: z.string().default("When this happens") }),
  }),

  /** The "Starter DM" — the message that opens the 24h window. */
  z.object({
    ...base,
    type: z.literal("SEND_MESSAGE"),
    data: z.object({
      label: z.string().default("Send DM"),
      message: messagePayloadSchema,
      /** For the very first message of a comment-triggered flow, reply privately
       *  to the comment rather than opening a cold thread. */
      asPrivateReply: z.boolean().default(false),
    }),
  }),

  /** Public reply in the comment thread (separate API surface). */
  z.object({
    ...base,
    type: z.literal("REPLY_TO_COMMENT"),
    data: z.object({
      label: z.string().default("Reply publicly"),
      /** One is picked at random to keep replies from looking robotic. */
      replies: z.array(z.string().min(1)).min(1),
    }),
  }),

  /** Wait. Capped at 24h because the messaging window closes. */
  z.object({
    ...base,
    type: z.literal("DELAY"),
    data: z.object({
      label: z.string().default("Wait"),
      minutes: z.number().int().min(1).max(1440),
    }),
  }),

  z.object({
    ...base,
    type: z.literal("CONDITION"),
    data: z.object({
      label: z.string().default("If / else"),
      conditions: z.array(conditionSchema).min(1),
      /** all = AND, any = OR */
      mode: z.enum(["all", "any"]).default("all"),
    }),
  }),

  /** SendDM's "Ask for Follow" — gate the payload behind a follow prompt. */
  z.object({
    ...base,
    type: z.literal("ASK_FOR_FOLLOW"),
    data: z.object({
      label: z.string().default("Ask for follow"),
      message: messagePayloadSchema,
      /** How long to wait for them to follow before taking the "not yet" branch. */
      recheckAfterMinutes: z.number().int().min(1).max(1440).default(5),
    }),
  }),

  /** LinkDM's "Follower Growth Tool" — send only to non-followers, skip followers. */
  z.object({
    ...base,
    type: z.literal("FOLLOWER_CHECK"),
    data: z.object({ label: z.string().default("Following me?") }),
  }),

  /** SendDM's "Collect User Data" — a form/survey/quiz asked inside the DM. */
  z.object({
    ...base,
    type: z.literal("COLLECT_INPUT"),
    data: z.object({
      label: z.string().default("Collect info"),
      formId: z.string().optional(),
      prompt: z.string().min(1),
      /** Where the answer is stored in the run's variables. */
      variable: z.string().min(1),
      fieldType: z.enum(["text", "email", "phone", "number", "choice", "rating"]).default("text"),
      options: z.array(z.string()).optional(),
      /** Give up waiting after this long and take the timeout branch. */
      timeoutMinutes: z.number().int().min(1).max(1440).default(60),
    }),
  }),

  z.object({
    ...base,
    type: z.literal("AI_REPLY"),
    data: z.object({
      label: z.string().default("AI answers"),
      agentId: z.string().optional(),
      instructions: z.string().optional(),
      /** Hand to a human if the agent can't answer. */
      handoffOnUnknown: z.boolean().default(true),
    }),
  }),

  /** Hands out a code from a coupon pool, then sends it. */
  z.object({
    ...base,
    type: z.literal("SEND_COUPON"),
    data: z.object({
      label: z.string().default("Send a coupon"),
      poolId: z.string().min(1),
      /** {{coupon}} is substituted with the code they were issued. */
      message: messagePayloadSchema,
      /** Sent instead when the pool has run out. */
      emptyMessage: z.string().optional(),
    }),
  }),

  z.object({
    ...base,
    type: z.literal("TAG"),
    data: z.object({
      label: z.string().default("Tag contact"),
      action: z.enum(["add", "remove"]).default("add"),
      tags: z.array(z.string().min(1)).min(1),
    }),
  }),

  z.object({
    ...base,
    type: z.literal("SET_FIELD"),
    data: z.object({
      label: z.string().default("Set field"),
      key: z.string().min(1),
      value: z.string(),
    }),
  }),

  /** A/B split — weights are normalised at runtime. */
  z.object({
    ...base,
    type: z.literal("RANDOMIZER"),
    data: z.object({
      label: z.string().default("Split test"),
      branches: z.array(z.object({ key: z.string(), weight: z.number().min(0) })).min(2),
    }),
  }),

  z.object({
    ...base,
    type: z.literal("HTTP_REQUEST"),
    data: z.object({
      label: z.string().default("Call webhook"),
      url: z.string().url(),
      method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("POST"),
      headers: z.record(z.string(), z.string()).default({}),
      body: z.string().optional(),
      /** Store the JSON response under this variable. */
      saveAs: z.string().optional(),
    }),
  }),

  /** Stop automating and surface the thread in the Inbox for a human. */
  z.object({
    ...base,
    type: z.literal("HUMAN_HANDOFF"),
    data: z.object({
      label: z.string().default("Hand to human"),
      note: z.string().optional(),
      notifyMessage: messagePayloadSchema.optional(),
    }),
  }),

  z.object({
    ...base,
    type: z.literal("END"),
    data: z.object({
      label: z.string().default("End"),
      /** Marks the run as a conversion for funnel analytics. */
      goal: z.boolean().default(false),
    }),
  }),
]);

export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowNodeType = FlowNode["type"];

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  /**
   * Which output of the source node this edge leaves from:
   *  CONDITION / FOLLOWER_CHECK / ASK_FOR_FOLLOW → "yes" | "no"
   *  COLLECT_INPUT                                → "next" | "timeout"
   *  RANDOMIZER                                   → the branch key
   *  everything else                              → "next"
   */
  sourceHandle: z.string().nullable().optional(),
  label: z.string().optional(),
});

export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
});

export type FlowGraph = z.infer<typeof flowGraphSchema>;

// --- Validation beyond shape ------------------------------------------------

export type GraphIssue = { level: "error" | "warning"; message: string; nodeId?: string };

/**
 * Structural + policy validation. The builder shows these live, and the API
 * refuses to enable an automation that has errors.
 */
export function validateGraph(graph: FlowGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodes = graph.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const triggers = nodes.filter((n) => n.type === "TRIGGER");
  if (triggers.length === 0) issues.push({ level: "error", message: "The flow needs a trigger." });
  if (triggers.length > 1)
    issues.push({ level: "error", message: "A flow can only have one trigger." });

  for (const edge of graph.edges) {
    if (!byId.has(edge.source))
      issues.push({ level: "error", message: `Edge points from a missing step.`, nodeId: edge.source });
    if (!byId.has(edge.target))
      issues.push({ level: "error", message: `Edge points to a missing step.`, nodeId: edge.target });
  }

  // Unreachable steps
  const reachable = new Set<string>();
  const queue = triggers.map((t) => t.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const e of graph.edges) if (e.source === id) queue.push(e.target);
  }
  for (const node of nodes) {
    if (node.type !== "TRIGGER" && !reachable.has(node.id)) {
      issues.push({ level: "warning", message: `"${node.data.label}" can never be reached.`, nodeId: node.id });
    }
  }

  // Branching nodes must have both outputs wired.
  for (const node of nodes) {
    const handles = outputHandles(node);
    if (handles.length <= 1) continue;
    for (const handle of handles) {
      const wired = graph.edges.some((e) => e.source === node.id && (e.sourceHandle ?? "next") === handle);
      if (!wired) {
        issues.push({
          level: "warning",
          message: `"${node.data.label}" has nothing connected to its "${handle}" path.`,
          nodeId: node.id,
        });
      }
    }
  }

  // The 24-hour messaging window is the hard product constraint (docs/META_API.md §6).
  const longestDelay = cumulativeDelayMinutes(graph);
  if (longestDelay > 1440) {
    issues.push({
      level: "error",
      message: `The delays in this flow add up to ${Math.round(longestDelay / 60)}h. Instagram closes the messaging window after 24h, so later steps would never send.`,
    });
  }

  // Mirrors LinkDM's published maximum of 8 follow-up DMs after the starter DM.
  const sendCount = nodes.filter((n) => n.type === "SEND_MESSAGE").length;
  if (sendCount > 9) {
    issues.push({
      level: "warning",
      message: `${sendCount} messages in one flow is a lot. Keeping it to a starter DM plus 8 follow-ups is the safe ceiling.`,
    });
  }

  return issues;
}

/** Which output handles a node exposes. */
export function outputHandles(node: FlowNode): string[] {
  switch (node.type) {
    case "CONDITION":
    case "FOLLOWER_CHECK":
    case "ASK_FOR_FOLLOW":
      return ["yes", "no"];
    case "COLLECT_INPUT":
      return ["next", "timeout"];
    case "SEND_COUPON":
      return ["next", "empty"];
    case "RANDOMIZER":
      return node.data.branches.map((b) => b.key);
    case "END":
      return [];
    default:
      return ["next"];
  }
}

/** Worst-case cumulative delay along any path, in minutes. */
export function cumulativeDelayMinutes(graph: FlowGraph): number {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const start = graph.nodes.find((n) => n.type === "TRIGGER");
  if (!start) return 0;

  let worst = 0;
  const walk = (nodeId: string, total: number, seen: Set<string>) => {
    if (seen.has(nodeId)) return; // cycle guard
    const node = byId.get(nodeId);
    if (!node) return;

    let next = total;
    if (node.type === "DELAY") next += node.data.minutes;
    if (node.type === "ASK_FOR_FOLLOW") next += node.data.recheckAfterMinutes;
    if (node.type === "COLLECT_INPUT") next += node.data.timeoutMinutes;
    worst = Math.max(worst, next);

    const nextSeen = new Set(seen).add(nodeId);
    for (const edge of graph.edges) {
      if (edge.source === nodeId) walk(edge.target, next, nextSeen);
    }
  };

  walk(start.id, 0, new Set());
  return worst;
}
