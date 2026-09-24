import { z } from "zod";
import { requireFeature } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { formFieldSchema } from "@/lib/engine/schema";

export const runtime = "nodejs";

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  kind: z.enum(["FORM", "SURVEY", "QUIZ", "ORDER"]).default("FORM"),
  fields: z.array(formFieldSchema).min(1).max(20),
  successMessage: z.string().max(1000).nullable().optional(),
});

export const POST = route(async ({ workspace, request }) => {
  requireFeature(workspace, "leadCapture");
  const body = await parseBody(request, upsertSchema);

  if (body.id) {
    const existing = await prisma.leadForm.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) throw new AuthError("Form not found.", 404);

    const form = await prisma.leadForm.update({
      where: { id: body.id },
      data: {
        name: body.name,
        kind: body.kind,
        fields: body.fields as object[],
        successMessage: body.successMessage ?? null,
      },
    });
    return ok({ form });
  }

  const form = await prisma.leadForm.create({
    data: {
      workspaceId: workspace.id,
      name: body.name,
      kind: body.kind,
      fields: body.fields as object[],
      successMessage: body.successMessage ?? null,
    },
  });
  return ok({ form });
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const form = await prisma.leadForm.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!form) throw new AuthError("Form not found.", 404);

  await prisma.leadForm.delete({ where: { id } });
  return ok();
});
