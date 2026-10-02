import { z } from "zod";
import { requireFeature } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { assertAccount, ok, parseBody, route } from "@/lib/api";
import { publishScheduledPost } from "@/lib/engine/scheduler";
import { checkScheduledMedia } from "@/lib/media/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

const createSchema = z.object({
  accountId: z.string().min(1),
  mediaType: z.enum(["IMAGE", "VIDEO", "REELS", "CAROUSEL"]).default("IMAGE"),
  caption: z.string().max(2200).optional(),
  mediaUrls: z.array(z.string().url()).min(1).max(10),
  thumbUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime(),
  attachAutomationIds: z.array(z.string()).default([]),
});

export const POST = route(async ({ workspace, request }) => {
  requireFeature(workspace, "scheduler");
  const body = await parseBody(request, createSchema);
  await assertAccount(workspace.id, body.accountId);

  const when = new Date(body.scheduledAt);
  if (when.getTime() < Date.now() - 60_000) {
    return Response.json({ error: "Pick a time in the future." }, { status: 400 });
  }
  const media = await checkScheduledMedia(workspace.id, body.mediaType, body.mediaUrls);
  if (media.error !== null) return Response.json({ error: media.error }, { status: 400 });
  const { uploads } = media;

  const post = await prisma.scheduledPost.create({
    data: {
      accountId: body.accountId,
      mediaType: body.mediaType,
      caption: body.caption ?? null,
      mediaUrls: body.mediaUrls,
      thumbUrl: body.thumbUrl ?? null,
      scheduledAt: when,
      attachAutomationIds: body.attachAutomationIds,
      status: "scheduled",
    },
  });
  if (uploads.length) {
    await prisma.mediaUpload.updateMany({
      where: { id: { in: uploads.map((u) => u.id) } },
      data: { scheduledPostId: post.id },
    });
  }

  return ok({ post });
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["cancel", "publish_now", "retry"]),
});

export const PATCH = route(async ({ workspace, request }) => {
  const { id, action } = await parseBody(request, actionSchema);
  // Cancelling is always allowed; only actions that publish are gated.
  if (action !== "cancel") requireFeature(workspace, "scheduler");

  const post = await prisma.scheduledPost.findFirst({
    where: { id, account: { workspaceId: workspace.id } },
  });
  if (!post) throw new AuthError("Scheduled post not found.", 404);

  if (action === "cancel") {
    if (post.status === "published") {
      return Response.json({ error: "That post is already live on Instagram." }, { status: 400 });
    }
    await prisma.scheduledPost.update({ where: { id }, data: { status: "cancelled" } });
    return ok();
  }

  // publish_now / retry both mean "go, right away".
  await prisma.scheduledPost.update({
    where: { id },
    data: { status: "scheduled", scheduledAt: new Date(), error: null },
  });
  void publishScheduledPost(id).catch((error) =>
    console.error("[scheduler] manual publish failed", error),
  );

  return ok();
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const post = await prisma.scheduledPost.findFirst({
    where: { id, account: { workspaceId: workspace.id } },
  });
  if (!post) throw new AuthError("Scheduled post not found.", 404);

  await prisma.scheduledPost.delete({ where: { id } });
  return ok();
});
