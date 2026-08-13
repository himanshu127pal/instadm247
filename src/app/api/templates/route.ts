import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { assertAccount, ok, parseBody, route } from "@/lib/api";
import { messagePayloadSchema } from "@/lib/engine/schema";
import { randomToken } from "@/lib/crypto";
import { getClientForAccount } from "@/lib/meta/account";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("resource", [
  z.object({
    resource: z.literal("template"),
    id: z.string().optional(),
    name: z.string().min(1).max(120),
    category: z.string().max(40).default("general"),
    payload: messagePayloadSchema,
  }),
  z.object({
    resource: z.literal("link"),
    destination: z.string().url(),
    label: z.string().max(120).optional(),
  }),
  z.object({
    resource: z.literal("icebreakers"),
    accountId: z.string().min(1),
    /** Instagram shows 4 and allows 5 configured, each up to 80 characters. */
    questions: z.array(z.string().min(1).max(80)).max(5),
  }),
]);

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, bodySchema);

  if (body.resource === "template") {
    if (body.id) {
      const existing = await prisma.template.findFirst({
        where: { id: body.id, workspaceId: workspace.id },
      });
      if (!existing) throw new AuthError("Template not found.", 404);

      const template = await prisma.template.update({
        where: { id: body.id },
        data: { name: body.name, category: body.category, payload: body.payload as object },
      });
      return ok({ template });
    }

    const template = await prisma.template.create({
      data: {
        workspaceId: workspace.id,
        name: body.name,
        category: body.category,
        payload: body.payload as object,
      },
    });
    return ok({ template });
  }

  if (body.resource === "link") {
    const link = await prisma.trackedLink.create({
      data: {
        workspaceId: workspace.id,
        code: randomToken(6),
        destination: body.destination,
        label: body.label ?? null,
      },
    });
    return ok({ link });
  }

  // Ice breakers — LinkDM's "Inbox Conversation Starters".
  const account = await assertAccount(workspace.id, body.accountId);

  await prisma.iceBreaker.deleteMany({ where: { accountId: account.id } });
  await prisma.iceBreaker.createMany({
    data: body.questions.map((question, order) => ({
      accountId: account.id,
      question,
      order,
    })),
  });

  // Push them to Instagram so they actually appear in the inbox.
  const client = await getClientForAccount(account);
  if (client && body.questions.length > 0) {
    try {
      await client.setIceBreakers(
        body.questions.map((question, index) => ({
          question,
          // The matcher looks for the automation id inside the payload.
          payload: `ICEBREAKER:${account.id}:${index}`,
        })),
      );
    } catch (error) {
      return Response.json(
        {
          error: `Saved here, but Instagram rejected them: ${(error as Error).message}`,
        },
        { status: 502 },
      );
    }
  } else if (client && body.questions.length === 0) {
    await client.deleteMessengerProfile(["ice_breakers"]).catch(() => undefined);
  }

  return ok();
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id, resource } = await parseBody(
    request,
    z.object({ id: z.string().min(1), resource: z.enum(["template", "link"]) }),
  );

  if (resource === "template") {
    const template = await prisma.template.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!template) throw new AuthError("Template not found.", 404);
    await prisma.template.delete({ where: { id } });
  } else {
    const link = await prisma.trackedLink.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!link) throw new AuthError("Link not found.", 404);
    await prisma.trackedLink.delete({ where: { id } });
  }

  return ok();
});
