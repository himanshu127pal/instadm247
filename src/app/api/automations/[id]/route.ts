import { z } from "zod";
import { requireNodesAllowed } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { assertAutomation, ok, parseBody, route } from "@/lib/api";
import { flowGraphSchema, validateGraph } from "@/lib/engine/schema";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  triggerType: z.string().optional(),
  scope: z.enum(["SPECIFIC", "ALL_MEDIA", "UNIVERSAL", "AD"]).optional(),
  matchMode: z.enum(["ALL", "KEYWORD", "REACTION", "REPLY"]).optional(),
  matchType: z.enum(["CONTAINS", "EXACT", "STARTS_WITH", "REGEX"]).optional(),
  keywords: z.array(z.string()).optional(),
  negativeKeywords: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional(),
  fuzzyMatch: z.boolean().optional(),
  reentryPolicy: z.enum(["ONCE", "ALWAYS", "ONCE_PER_MEDIA", "COOLDOWN"]).optional(),
  cooldownMinutes: z.number().int().min(1).max(10_080).nullable().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  mediaIds: z.array(z.string()).optional(),
  graph: flowGraphSchema.optional(),
});

export const GET = route<{ id: string }>(async ({ workspace, params }) => {
  const automation = await assertAutomation(workspace.id, params.id);
  return ok({ automation });
});

export const PATCH = route<{ id: string }>(async ({ workspace, request, params }) => {
  const automation = await assertAutomation(workspace.id, params.id);
  const body = await parseBody(request, updateSchema);

  // Plan gates: saving a graph, and switching an automation on, both check
  // the steps it uses. Switching it OFF, or renaming it, never does — a
  // downgraded customer must always be able to stop what they built.
  if (body.graph) requireNodesAllowed(workspace, body.graph.nodes.map((n) => n.type));
  if (body.enabled === true && !body.graph) {
    const stored = (automation.flow?.nodes ?? []) as Array<{ type?: string }>;
    requireNodesAllowed(workspace, stored.map((n) => n.type ?? ""));
  }

  // Refuse to enable an automation whose flow has structural errors — the
  // failure would otherwise only show up when a real person triggers it.
  if (body.enabled === true) {
    const graph = body.graph ?? {
      nodes: automation.flow?.nodes ?? [],
      edges: automation.flow?.edges ?? [],
    };
    const parsed = flowGraphSchema.safeParse(graph);
    if (!parsed.success) {
      return ok({ error: "This flow has steps that aren't finished yet." });
    }
    const errors = validateGraph(parsed.data).filter((i) => i.level === "error");
    if (errors.length) {
      return Response.json(
        { error: errors[0].message, issues: errors },
        { status: 400 },
      );
    }
  }

  const { graph, mediaIds, ...scalars } = body;

  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: {
      ...scalars,
      ...(mediaIds
        ? {
            media: {
              deleteMany: {},
              create: mediaIds.map((mediaId) => ({ mediaId })),
            },
          }
        : {}),
      ...(graph
        ? {
            flow: {
              upsert: {
                create: {
                  name: `${automation.name} flow`,
                  nodes: graph.nodes as object[],
                  edges: graph.edges as object[],
                },
                update: {
                  nodes: graph.nodes as object[],
                  edges: graph.edges as object[],
                  version: { increment: 1 },
                },
              },
            },
          }
        : {}),
    },
    include: { flow: true, media: true },
  });

  return ok({ automation: updated });
});

export const DELETE = route<{ id: string }>(async ({ workspace, params }) => {
  const automation = await assertAutomation(workspace.id, params.id);
  await prisma.automation.delete({ where: { id: automation.id } });
  return ok();
});
