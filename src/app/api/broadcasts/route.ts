import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertAccount, ok, parseBody, route } from "@/lib/api";
import { previewAudience, runBroadcast, type SegmentFilter } from "@/lib/engine/broadcast";
import { enqueue } from "@/lib/engine/queues";
import { messagePayloadSchema } from "@/lib/engine/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(120),
  kind: z.enum(["BROADCAST", "REENGAGE"]).default("BROADCAST"),
  payload: messagePayloadSchema,
  segmentId: z.string().nullable().optional(),
  filter: z
    .object({
      tags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      activeWithinHours: z.number().int().min(1).max(720).optional(),
      isFollower: z.boolean().optional(),
    })
    .optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  /** REENGAGE only: how long after their last message to nudge, and repeat. */
  reengageAfterHours: z.number().int().min(1).max(168).optional(),
  recurring: z.boolean().default(false),
  sendNow: z.boolean().default(false),
});

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, createSchema);
  await assertAccount(workspace.id, body.accountId);

  const filter = (body.filter ?? {}) as SegmentFilter;
  const audience = await previewAudience(body.accountId, filter);

  // A segment is created implicitly so the broadcast keeps its targeting.
  let segmentId = body.segmentId ?? null;
  if (!segmentId && body.filter) {
    const segment = await prisma.segment.create({
      data: {
        workspaceId: workspace.id,
        name: `${body.name} audience`,
        filter: filter as object,
      },
    });
    segmentId = segment.id;
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      workspaceId: workspace.id,
      accountId: body.accountId,
      segmentId,
      name: body.name,
      kind: body.kind,
      payload: body.payload as object,
      status: body.sendNow ? "scheduled" : body.scheduledAt ? "scheduled" : "draft",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      reengageAfterHours: body.reengageAfterHours ?? null,
      recurring: body.recurring,
      targetCount: audience.total,
      eligibleCount: audience.eligible,
    },
  });

  if (body.sendNow) {
    const queued = await enqueue("broadcast", "send", { broadcastId: broadcast.id });
    if (!queued) {
      // No worker available — run it inline so the feature still works on a
      // single-process deployment.
      void runBroadcast(broadcast.id).catch((error) =>
        console.error("[broadcast] inline run failed", error),
      );
    }
  }

  return ok({ broadcast, audience });
});

/** Audience preview — how many people can legally receive this right now. */
export const PUT = route(async ({ workspace, request }) => {
  const body = await parseBody(
    request,
    z.object({
      accountId: z.string().min(1),
      filter: z
        .object({
          tags: z.array(z.string()).optional(),
          excludeTags: z.array(z.string()).optional(),
          activeWithinHours: z.number().int().min(1).max(720).optional(),
          isFollower: z.boolean().optional(),
        })
        .default({}),
    }),
  );
  await assertAccount(workspace.id, body.accountId);

  const audience = await previewAudience(body.accountId, body.filter as SegmentFilter);
  return ok({ audience });
});
