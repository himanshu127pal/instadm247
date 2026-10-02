import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { requireFeature } from "@/lib/plan";
import { UploadError, deleteUpload, publicUrl, saveUpload } from "@/lib/media/store";

export const runtime = "nodejs";
// A 300 MB video on a slow connection takes a while.
export const maxDuration = 300;

/**
 * Upload a photo or video for a scheduled post. See docs/SCHEDULER.md.
 *
 * The file is the raw request body (not multipart), so it streams straight to
 * disk instead of being held in memory. A video's size and length come as
 * query parameters, measured in the browser; a photo's are read from the file.
 */
export const POST = route(async ({ workspace, request }) => {
  requireFeature(workspace, "scheduler");
  if (!request.body) throw new AuthError("No file was sent.", 400);

  const q = new URL(request.url).searchParams;
  const num = (key: string) => Number(q.get(key) ?? NaN);
  const video = q.has("w") ? { width: num("w"), height: num("h"), durationSec: num("d") } : undefined;

  try {
    const upload = await saveUpload({ workspaceId: workspace.id, body: request.body, video });
    return ok({
      upload: {
        token: upload.token,
        url: publicUrl(upload),
        kind: upload.kind,
        mime: upload.mime,
        width: upload.width,
        height: upload.height,
        sizeBytes: upload.sizeBytes,
        durationSec: upload.durationSec,
      },
    });
  } catch (error) {
    if (error instanceof UploadError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
});

/** Remove an upload that isn't in a post yet (the customer took it out). */
export const DELETE = route(async ({ workspace, request }) => {
  const { token } = await parseBody(request, z.object({ token: z.string().min(1) }));
  const upload = await prisma.mediaUpload.findFirst({ where: { token, workspaceId: workspace.id } });
  if (!upload) throw new AuthError("File not found.", 404);
  if (upload.scheduledPostId) throw new AuthError("That file is part of a scheduled post.", 409);
  await deleteUpload(token);
  return ok();
});
