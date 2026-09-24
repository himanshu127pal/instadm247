import { z } from "zod";
import { requireNodesAllowed } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { assertAccount, ok, parseBody, route } from "@/lib/api";
import { buildDraftGraph, customizeSchema } from "@/lib/helper/draft";

export const runtime = "nodejs";

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(120),
  triggerType: z.enum([
    "COMMENT",
    "LIVE_COMMENT",
    "STORY_REPLY",
    "STORY_MENTION",
    "DM_KEYWORD",
    "ICE_BREAKER",
    "POSTBACK",
    "REFERRAL",
    "AD_COMMENT",
  ]),
  scope: z.enum(["SPECIFIC", "ALL_MEDIA", "UNIVERSAL", "AD"]).default("ALL_MEDIA"),
  matchMode: z.enum(["ALL", "KEYWORD", "REACTION", "REPLY"]).default("KEYWORD"),
  keywords: z.array(z.string().min(1)).default([]),
  mediaIds: z.array(z.string()).default([]),
  presetId: z.string().default("blank"),
  /** The customer's own words on top of the template — from an AI Helper draft. */
  customize: customizeSchema.default({}),
});

export const GET = route(async ({ workspace }) => {
  const automations = await prisma.automation.findMany({
    where: { account: { workspaceId: workspace.id } },
    include: {
      account: { select: { id: true, username: true, profilePictureUrl: true } },
      _count: { select: { runs: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ automations });
});

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, createSchema);
  await assertAccount(workspace.id, body.accountId);

  const graph = buildDraftGraph(body.presetId, body.customize);
  // A preset can include gated steps (an AI reply, lead capture). Refuse at
  // creation rather than let someone build a flow their plan won't run.
  requireNodesAllowed(workspace, graph.nodes.map((n) => n.type));

  const automation = await prisma.automation.create({
    data: {
      accountId: body.accountId,
      name: body.name,
      triggerType: body.triggerType,
      scope: body.scope,
      matchMode: body.matchMode,
      keywords: body.keywords,
      // New automations start switched off so nobody ships a half-built flow by
      // accident. The builder turns it on once the graph validates.
      enabled: false,
      flow: {
        create: {
          name: `${body.name} flow`,
          nodes: graph.nodes as object[],
          edges: graph.edges as object[],
        },
      },
      ...(body.mediaIds.length
        ? { media: { create: body.mediaIds.map((mediaId) => ({ mediaId })) } }
        : {}),
    },
    include: { flow: true },
  });

  return ok({ automation });
});
