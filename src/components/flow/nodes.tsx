"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  CircleDot,
  Clock,
  Flag,
  GitBranch,
  Globe,
  Image as ImageIcon,
  ListChecks,
  MessageSquare,
  MessageSquareReply,
  Shuffle,
  Tag,
  UserCheck,
  UserPlus,
  Variable,
  type LucideIcon,
} from "lucide-react";
import type { FlowNode, FlowNodeType } from "@/lib/engine/schema";
import { previewTemplate } from "@/lib/engine/template";
import { cn } from "@/lib/utils";

/**
 * Node cards for the React Flow canvas.
 *
 * Each card shows enough of its own configuration to be readable at a glance —
 * a builder where every step just says "Send message" is useless once a flow
 * has six of them.
 */

export const NODE_META: Record<
  FlowNodeType,
  { icon: LucideIcon; label: string; accent: string; description: string }
> = {
  TRIGGER: {
    icon: CircleDot,
    label: "Trigger",
    accent: "#52d67a",
    description: "What starts this flow",
  },
  SEND_MESSAGE: {
    icon: MessageSquare,
    label: "Send DM",
    accent: "#9d4edd",
    description: "Send a message, buttons or carousel",
  },
  REPLY_TO_COMMENT: {
    icon: MessageSquareReply,
    label: "Reply publicly",
    accent: "#7b2cbf",
    description: "Reply in the comment thread too",
  },
  DELAY: { icon: Clock, label: "Wait", accent: "#4cc9f0", description: "Pause before the next step" },
  CONDITION: {
    icon: GitBranch,
    label: "If / else",
    accent: "#ffd23f",
    description: "Branch on tags, fields or follower status",
  },
  ASK_FOR_FOLLOW: {
    icon: UserPlus,
    label: "Ask for follow",
    accent: "#ff5d73",
    description: "Nudge non-followers, then re-check",
  },
  FOLLOWER_CHECK: {
    icon: UserCheck,
    label: "Follower check",
    accent: "#ffd23f",
    description: "Branch on whether they follow you",
  },
  COLLECT_INPUT: {
    icon: ListChecks,
    label: "Ask a question",
    accent: "#2fb85c",
    description: "Capture an answer into a variable",
  },
  AI_REPLY: { icon: Bot, label: "AI replies", accent: "#ff9f45", description: "Answer from your knowledge base" },
  TAG: { icon: Tag, label: "Tag contact", accent: "#7d7563", description: "Add or remove tags" },
  SET_FIELD: {
    icon: Variable,
    label: "Set field",
    accent: "#7d7563",
    description: "Store a value on the contact",
  },
  RANDOMIZER: {
    icon: Shuffle,
    label: "Split test",
    accent: "#c77dff",
    description: "Send people down different paths",
  },
  HTTP_REQUEST: {
    icon: Globe,
    label: "Call a webhook",
    accent: "#7d7563",
    description: "Send data to another system",
  },
  HUMAN_HANDOFF: {
    icon: UserCheck,
    label: "Hand to a human",
    accent: "#f0435c",
    description: "Pause automation and open the inbox",
  },
  END: { icon: Flag, label: "End", accent: "#7d7563", description: "Finish the flow" },
};

/** One-line summary of what a configured node will actually do. */
export function describeNode(node: FlowNode): string {
  switch (node.type) {
    case "TRIGGER":
      return "Someone triggers this automation";
    case "SEND_MESSAGE": {
      const message = node.data.message;
      if (message.kind === "text") return previewTemplate(message.text);
      if (message.kind === "buttons")
        return `${previewTemplate(message.text)} · ${message.buttons.length} button${message.buttons.length > 1 ? "s" : ""}`;
      if (message.kind === "carousel")
        return `Carousel · ${message.slides.length} slide${message.slides.length > 1 ? "s" : ""}`;
      return `Sends ${message.kind === "image" ? "an image" : `a ${message.kind}`}`;
    }
    case "REPLY_TO_COMMENT":
      return `${node.data.replies.length} rotating repl${node.data.replies.length === 1 ? "y" : "ies"}`;
    case "DELAY": {
      const minutes = node.data.minutes;
      if (minutes < 60) return `Wait ${minutes} minute${minutes === 1 ? "" : "s"}`;
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return `Wait ${hours}h${rest ? ` ${rest}m` : ""}`;
    }
    case "CONDITION":
      return `${node.data.conditions.length} condition${node.data.conditions.length > 1 ? "s" : ""} · match ${node.data.mode}`;
    case "ASK_FOR_FOLLOW":
      return `Ask, then re-check after ${node.data.recheckAfterMinutes} min`;
    case "FOLLOWER_CHECK":
      return "Yes if they already follow you";
    case "COLLECT_INPUT":
      return `Saves their answer as {{${node.data.variable}}}`;
    case "AI_REPLY":
      return node.data.handoffOnUnknown ? "Hands off when unsure" : "Always answers";
    case "TAG":
      return `${node.data.action === "add" ? "Add" : "Remove"} ${node.data.tags.join(", ")}`;
    case "SET_FIELD":
      return `${node.data.key} = ${node.data.value || "(empty)"}`;
    case "RANDOMIZER":
      return `${node.data.branches.length} paths`;
    case "HTTP_REQUEST":
      return `${node.data.method} ${node.data.url}`;
    case "HUMAN_HANDOFF":
      return node.data.note || "Opens the conversation in your inbox";
    case "END":
      return node.data.goal ? "Counts as a conversion" : "Flow ends here";
  }
}

export type FlowNodeData = {
  node: FlowNode;
  selected?: boolean;
  issue?: string;
};

function BaseNode({
  node,
  selected,
  issue,
  outputs,
}: {
  node: FlowNode;
  selected?: boolean;
  issue?: string;
  outputs: Array<{ id: string; label: string; left: string }>;
}) {
  const meta = NODE_META[node.type];
  const Icon = meta.icon;
  const isTrigger = node.type === "TRIGGER";

  return (
    <div
      className={cn(
        "w-[248px] rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] transition-all",
        "shadow-[4px_4px_0_0_var(--shadow-ink)]",
        selected && "shadow-[4px_4px_0_0_var(--color-zap-400)]",
        issue && "shadow-[4px_4px_0_0_var(--color-pow-500)]",
      )}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-[var(--border-strong)]"
          style={{ background: "var(--border-strong)" }}
        />
      )}

      <div className="flex items-center gap-2.5 border-b-2 border-[var(--border)] px-3 py-2.5">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-[var(--border)] text-white"
          style={{ backgroundColor: meta.accent }}
        >
          <Icon className="h-[14px] w-[14px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-extrabold">{node.data.label}</span>
          <span className="block truncate text-[10.5px] text-[var(--text-faint)]">
            {meta.label}
          </span>
        </span>
      </div>

      <div className="px-3 py-2.5">
        <p className="line-clamp-2 text-[11.5px] font-medium leading-relaxed text-[var(--text-muted)]">
          {describeNode(node)}
        </p>
        {issue && <p className="mt-1.5 text-[10.5px] font-bold text-[var(--color-zonk-500)]">{issue}</p>}
      </div>

      {outputs.map((output) => (
        <Handle
          key={output.id}
          id={output.id}
          type="source"
          position={Position.Bottom}
          style={{ left: output.left, background: meta.accent }}
        >
          {outputs.length > 1 && (
            <span className="pointer-events-none absolute left-1/2 top-2.5 -translate-x-1/2 whitespace-nowrap text-[9.5px] font-medium text-[var(--text-faint)]">
              {output.label}
            </span>
          )}
        </Handle>
      ))}
    </div>
  );
}

function outputsFor(node: FlowNode): Array<{ id: string; label: string; left: string }> {
  switch (node.type) {
    case "CONDITION":
    case "FOLLOWER_CHECK":
    case "ASK_FOR_FOLLOW":
      return [
        { id: "yes", label: "yes", left: "30%" },
        { id: "no", label: "no", left: "70%" },
      ];
    case "COLLECT_INPUT":
      return [
        { id: "next", label: "answered", left: "30%" },
        { id: "timeout", label: "no reply", left: "70%" },
      ];
    case "RANDOMIZER": {
      const branches = node.data.branches;
      return branches.map((branch, i) => ({
        id: branch.key,
        label: branch.key,
        left: `${((i + 1) / (branches.length + 1)) * 100}%`,
      }));
    }
    case "END":
      return [];
    default:
      return [{ id: "next", label: "next", left: "50%" }];
  }
}

/** Single renderer registered for every node type. */
export function FlowNodeCard(props: NodeProps) {
  const data = props.data as unknown as FlowNodeData;
  return (
    <BaseNode
      node={data.node}
      selected={props.selected}
      issue={data.issue}
      outputs={outputsFor(data.node)}
    />
  );
}

export const nodeTypes = { flowNode: FlowNodeCard };

/** Steps offered in the "add a step" palette, in a sensible authoring order. */
export const ADDABLE_TYPES: FlowNodeType[] = [
  "SEND_MESSAGE",
  "DELAY",
  "CONDITION",
  "FOLLOWER_CHECK",
  "ASK_FOR_FOLLOW",
  "COLLECT_INPUT",
  "REPLY_TO_COMMENT",
  "AI_REPLY",
  "TAG",
  "SET_FIELD",
  "RANDOMIZER",
  "HTTP_REQUEST",
  "HUMAN_HANDOFF",
  "END",
];

export { ImageIcon };
