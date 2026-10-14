import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { saveBioPage } from "@/lib/bio-pages";
import { bioPageSchema as upsertSchema } from "@/lib/bio-schema";

export const runtime = "nodejs";

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, upsertSchema);
  const result = await saveBioPage(workspace, body);
  if (!result.ok) return Response.json({ error: result.error, pageId: result.pageId }, { status: result.status });
  return ok({ page: { id: result.pageId }, blockIds: result.blockIds, tabIds: result.tabIds });
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const page = await prisma.bioPage.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!page) throw new AuthError("Page not found.", 404);

  await prisma.bioPage.delete({ where: { id } });
  return ok();
});
