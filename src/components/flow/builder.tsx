"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Plus, Save, Sparkles } from "lucide-react";
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeType } from "@/lib/engine/schema";
import { cumulativeDelayMinutes, flowGraphSchema, validateGraph } from "@/lib/engine/schema";
import { Badge, Button } from "@/components/ui";
import { ADDABLE_TYPES, NODE_META, nodeTypes } from "./nodes";
import { NodeInspector } from "./inspector";
import { cn } from "@/lib/utils";

/**
 * The visual flow builder.
 *
 * React Flow owns positions and edges; we keep our own typed node data in the
 * node's `data.node`. Saving re-validates the whole graph with Zod, so an
 * invalid flow can never reach the engine.
 */

export function FlowBuilder(props: {
  automationId: string;
  initialGraph: FlowGraph;
  enabled: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}

function toReactFlowNodes(graph: FlowGraph): Node[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: "flowNode",
    position: node.position,
    data: { node } as unknown as Record<string, unknown>,
    deletable: node.type !== "TRIGGER",
  }));
}

function toReactFlowEdges(graph: FlowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? "next",
    type: "smoothstep",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    label: labelForHandle(edge.sourceHandle),
    labelStyle: { fill: "var(--text-faint)", fontSize: 10 },
    labelBgStyle: { fill: "var(--bg)" },
  }));
}

function labelForHandle(handle: string | null | undefined): string | undefined {
  if (!handle || handle === "next") return undefined;
  if (handle === "yes") return "yes";
  if (handle === "no") return "no";
  if (handle === "timeout") return "no reply";
  return handle;
}

function BuilderInner({
  automationId,
  initialGraph,
  enabled,
  onDirtyChange,
}: {
  automationId: string;
  initialGraph: FlowGraph;
  enabled: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toReactFlowNodes(initialGraph));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toReactFlowEdges(initialGraph));
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const markDirty = React.useCallback(() => {
    setDirty(true);
    onDirtyChange?.(true);
  }, [onDirtyChange]);

  // Current graph in our own shape, recomputed from React Flow state.
  const graph: FlowGraph = React.useMemo(
    () => ({
      nodes: nodes.map((n) => ({
        ...((n.data as { node: FlowNode }).node),
        position: n.position,
      })) as FlowNode[],
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? "next",
      })) as FlowEdge[],
    }),
    [nodes, edges],
  );

  const issues = React.useMemo(() => validateGraph(graph), [graph]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const totalDelay = React.useMemo(() => cumulativeDelayMinutes(graph), [graph]);

  const selectedNode = React.useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  /**
   * Surface per-node issues on the cards themselves.
   *
   * `issues` is derived from `nodes`, so this effect writes to the very state it
   * depends on. Two things stop that becoming an infinite loop:
   *   1. the updater returns the SAME array reference when nothing changed, so
   *      React bails out of the re-render entirely; and
   *   2. the dependency is a stable string signature rather than the freshly
   *      built `issues` array, whose identity changes on every render.
   */
  const issueSignature = React.useMemo(
    () =>
      issues
        .filter((i) => i.nodeId)
        .map((i) => `${i.nodeId}:${i.message}`)
        .sort()
        .join("|"),
    [issues],
  );

  React.useEffect(() => {
    const byNode = new Map<string, string>();
    for (const issue of issues) {
      if (issue.nodeId && !byNode.has(issue.nodeId)) byNode.set(issue.nodeId, issue.message);
    }

    setNodes((current) => {
      let changed = false;
      const next = current.map((n) => {
        const data = n.data as { node: FlowNode; issue?: string };
        const issue = byNode.get(n.id);
        if (data.issue === issue) return n;
        changed = true;
        return { ...n, data: { ...data, issue } };
      });
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueSignature, setNodes]);

  const onConnect = React.useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        // One edge per source handle — a step can't fan out to two places.
        const filtered = current.filter(
          (e) =>
            !(
              e.source === connection.source &&
              (e.sourceHandle ?? "next") === (connection.sourceHandle ?? "next")
            ),
        );
        return addEdge(
          {
            ...connection,
            id: `edge_${nanoid(8)}`,
            type: "smoothstep",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            label: labelForHandle(connection.sourceHandle),
            labelStyle: { fill: "var(--text-faint)", fontSize: 10 },
            labelBgStyle: { fill: "var(--bg)" },
          },
          filtered,
        );
      });
      markDirty();
    },
    [setEdges, markDirty],
  );

  function addNode(type: FlowNodeType) {
    const node = createNode(type);
    const viewportCenter = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    node.position = { x: viewportCenter.x - 124, y: viewportCenter.y };

    setNodes((current) => [
      ...current,
      {
        id: node.id,
        type: "flowNode",
        position: node.position,
        data: { node } as unknown as Record<string, unknown>,
      },
    ]);
    setSelectedId(node.id);
    setPaletteOpen(false);
    markDirty();
  }

  function updateNode(next: FlowNode) {
    setNodes((current) =>
      current.map((n) =>
        n.id === next.id ? { ...n, data: { ...(n.data as object), node: next } } : n,
      ),
    );
    markDirty();
  }

  function deleteNode(id: string) {
    setNodes((current) => current.filter((n) => n.id !== id));
    setEdges((current) => current.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
    markDirty();
  }

  async function save() {
    const parsed = flowGraphSchema.safeParse(graph);
    if (!parsed.success) {
      toast.error("Some steps are missing required details.", {
        description: parsed.error.issues[0]?.message,
      });
      return;
    }
    if (errors.length) {
      toast.error(errors[0].message);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: parsed.data }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Could not save");
      }
      setDirty(false);
      onDirtyChange?.(false);
      toast.success("Flow saved");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Cmd/Ctrl+S saves, like every other editor.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[560px] overflow-hidden rounded-[var(--radius-card)] border-[3px] border-[var(--border)] bg-[var(--bg)] shadow-[5px_5px_0_0_var(--shadow-ink)]">
      <div className="relative min-w-0 flex-1">
        {/* Toolbar */}
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button size="sm" variant="gradient" onClick={() => setPaletteOpen((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              Add a step
            </Button>

            {paletteOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 max-h-[420px] w-[280px] overflow-y-auto rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-1.5 shadow-[5px_5px_0_0_var(--shadow-ink)]">
                {ADDABLE_TYPES.map((type) => {
                  const meta = NODE_META[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => addNode(type)}
                      className="flex w-full items-start gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-[var(--color-pow-400)]/30"
                    >
                      <span
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-[var(--border)] text-white"
                        style={{ backgroundColor: meta.accent }}
                      >
                        <Icon className="h-[14px] w-[14px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-extrabold">{meta.label}</span>
                        <span className="block text-[11px] leading-snug text-[var(--text-muted)]">
                          {meta.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button size="sm" variant="secondary" onClick={() => fitView({ duration: 400 })}>
            Fit view
          </Button>
        </div>

        {/* Status */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {errors.length > 0 ? (
            <Badge tone="danger">
              <AlertTriangle className="h-3 w-3" />
              {errors.length} to fix
            </Badge>
          ) : warnings.length > 0 ? (
            <Badge tone="warning">
              <AlertTriangle className="h-3 w-3" />
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </Badge>
          ) : (
            <Badge tone="success">
              <CheckCircle2 className="h-3 w-3" />
              Valid
            </Badge>
          )}

          {totalDelay > 0 && (
            <Badge tone={totalDelay > 1440 ? "danger" : "neutral"}>
              {formatDelay(totalDelay)} longest path
            </Badge>
          )}

          <Button size="sm" variant={dirty ? "primary" : "secondary"} onClick={save} loading={saving}>
            <Save className="h-3.5 w-3.5" />
            {dirty ? "Save" : "Saved"}
          </Button>
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 max-w-md space-y-1.5">
            {issues.slice(0, 3).map((issue, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl border-[2.5px] border-[var(--border)] px-3 py-2 text-[11.5px] font-bold shadow-[3px_3px_0_0_var(--shadow-ink)]",
                  issue.level === "error"
                    ? "bg-[var(--color-zap-400)] text-white"
                    : "bg-[var(--color-pow-400)] text-[#12110e]",
                )}
              >
                {issue.message}
              </div>
            ))}
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            if (changes.some((c) => c.type === "position" || c.type === "remove")) markDirty();
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
            if (changes.some((c) => c.type === "remove")) markDirty();
          }}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => {
            setSelectedId(null);
            setPaletteOpen(false);
          }}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep", animated: true }}
          minZoom={0.25}
          maxZoom={1.6}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-strong)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => {
              const data = node.data as unknown as { node: FlowNode };
              return NODE_META[data.node.type].accent;
            }}
            maskColor="color-mix(in oklab, var(--bg) 70%, transparent)"
            className="!bottom-3 !right-3 !h-24 !w-40 !rounded-xl"
          />
        </ReactFlow>
      </div>

      {selectedNode && (
        <div className="w-[340px] shrink-0">
          <NodeInspector
            node={selectedNode}
            onChange={updateNode}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Sensible defaults for a freshly dropped node. */
function createNode(type: FlowNodeType): FlowNode {
  const id = `${type.toLowerCase()}_${nanoid(8)}`;
  const position = { x: 0, y: 0 };
  const label = NODE_META[type].label;

  switch (type) {
    case "SEND_MESSAGE":
      return {
        id,
        type,
        position,
        data: {
          label,
          asPrivateReply: false,
          message: { kind: "text", text: "Hey {{first_name}}!" },
        },
      };
    case "REPLY_TO_COMMENT":
      return { id, type, position, data: { label, replies: ["Just sent it 💌"] } };
    case "DELAY":
      return { id, type, position, data: { label, minutes: 20 } };
    case "CONDITION":
      return {
        id,
        type,
        position,
        data: { label, mode: "all", conditions: [{ field: "is_follower", operator: "is_true" }] },
      };
    case "ASK_FOR_FOLLOW":
      return {
        id,
        type,
        position,
        data: {
          label,
          recheckAfterMinutes: 5,
          message: {
            kind: "text",
            text: "One quick thing — give me a follow so you don't miss the next one 🙏",
          },
        },
      };
    case "FOLLOWER_CHECK":
      return { id, type, position, data: { label } };
    case "COLLECT_INPUT":
      return {
        id,
        type,
        position,
        data: {
          label,
          prompt: "What's the best email to send this to?",
          variable: "email",
          fieldType: "email",
          timeoutMinutes: 60,
        },
      };
    case "AI_REPLY":
      return { id, type, position, data: { label, handoffOnUnknown: true } };
    case "TAG":
      return { id, type, position, data: { label, action: "add", tags: ["lead"] } };
    case "SET_FIELD":
      return { id, type, position, data: { label, key: "source", value: "instagram" } };
    case "RANDOMIZER":
      return {
        id,
        type,
        position,
        data: {
          label,
          branches: [
            { key: "A", weight: 50 },
            { key: "B", weight: 50 },
          ],
        },
      };
    case "HTTP_REQUEST":
      return {
        id,
        type,
        position,
        data: { label, url: "https://example.com/hook", method: "POST", headers: {} },
      };
    case "HUMAN_HANDOFF":
      return { id, type, position, data: { label } };
    case "END":
      return { id, type, position, data: { label, goal: true } };
    case "TRIGGER":
      return { id, type, position, data: { label } };
  }
}

export { Sparkles };
