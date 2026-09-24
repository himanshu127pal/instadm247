import { z } from "zod";
import { requireFeature } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { normalizeText } from "@/lib/engine/match";

export const runtime = "nodejs";

const agentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  persona: z.string().max(2000).optional(),
  tone: z.string().max(40).optional(),
  language: z.string().max(40).optional(),
  maxTurns: z.number().int().min(1).max(20).optional(),
  bannedTopics: z.array(z.string()).optional(),
  fallbackMessage: z.string().min(1).max(900).optional(),
  handoffOnUnknown: z.boolean().optional(),
  model: z.string().max(80).optional(),
});

export const PATCH = route(async ({ workspace, request }) => {
  const body = await parseBody(request, agentSchema);
  // Only switching the agent ON is gated; turning it off must always work.
  if (body.enabled === true) requireFeature(workspace, "aiAgent");

  const agent = await prisma.aiAgent.findFirst({
    where: { id: body.id, workspaceId: workspace.id },
  });
  if (!agent) throw new AuthError("Agent not found.", 404);

  const { id, ...data } = body;
  const updated = await prisma.aiAgent.update({ where: { id }, data });
  return ok({ agent: updated });
});

const docSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
});

export const POST = route(async ({ workspace, request }) => {
  requireFeature(workspace, "aiAgent");
  const body = await parseBody(request, docSchema);

  // A small keyword index is what retrieval scores against — good enough for
  // FAQ-scale knowledge bases, and keeps the deployment to Postgres + Redis.
  const keywords = [
    ...new Set(
      normalizeText(`${body.title} ${body.content}`)
        .split(" ")
        .filter((word) => word.length > 3),
    ),
  ].slice(0, 120);

  if (body.id) {
    const existing = await prisma.knowledgeDoc.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) throw new AuthError("Document not found.", 404);

    const doc = await prisma.knowledgeDoc.update({
      where: { id: body.id },
      data: { title: body.title, content: body.content, keywords },
    });
    return ok({ doc });
  }

  const agent = await prisma.aiAgent.findFirst({ where: { workspaceId: workspace.id } });
  const doc = await prisma.knowledgeDoc.create({
    data: {
      workspaceId: workspace.id,
      agentId: agent?.id ?? null,
      title: body.title,
      content: body.content,
      keywords,
    },
  });
  return ok({ doc });
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const doc = await prisma.knowledgeDoc.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!doc) throw new AuthError("Document not found.", 404);

  await prisma.knowledgeDoc.delete({ where: { id } });
  return ok();
});
