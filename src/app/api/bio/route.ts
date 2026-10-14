import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { checkSlug } from "@/lib/bio-slug";
import { isBranded } from "@/lib/branding";
import { bioPageSchema as upsertSchema } from "@/lib/bio-schema";

export const runtime = "nodejs";

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, upsertSchema);
  try {
    return await upsertPage(workspace, body);
  } catch (error) {
    // Two people claiming the same free link at once: the check passed for
    // both, and the unique index let only one through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: `/l/${body.slug} was just taken. Try another.` }, { status: 409 });
    }
    throw error;
  }
});

async function upsertPage(workspace: { id: string; planKey: string }, body: z.infer<typeof upsertSchema>) {
  // Slugs are global — someone else may already have it. Same rules as the
  // live check in the editor.
  const slugCheck = await checkSlug(body.slug, body.id);
  if (!slugCheck.available) {
    return Response.json({ error: slugCheck.reason }, { status: 409 });
  }

  // On Free the badge is always shown, so the switch is locked in the editor.
  // Keep whatever was saved before rather than taking a value the customer
  // couldn't have chosen; it applies again if they upgrade.
  const branded = isBranded(workspace);
  const previous = body.id
    ? await prisma.bioPage.findFirst({ where: { id: body.id, workspaceId: workspace.id }, select: { showBadge: true } })
    : null;
  const showBadge = branded ? (previous?.showBadge ?? true) : body.showBadge;

  const data = {
    slug: body.slug,
    title: body.title,
    bio: body.bio ?? null,
    avatarUrl: body.avatarUrl ?? null,
    theme: body.theme,
    design: body.design ?? Prisma.DbNull,
    published: body.published,
    showBadge,
    accountId: body.accountId ?? null,
  };

  if (body.id) {
    const existing = await prisma.bioPage.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) throw new AuthError("Page not found.", 404);

    // Replace the block list wholesale, but keep click counts for blocks that
    // survived the edit — losing a link's history because a label changed
    // would be maddening.
    const keptIds = body.blocks.map((b) => b.id).filter(Boolean) as string[];
    await prisma.bioBlock.deleteMany({
      where: { pageId: body.id, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) },
    });

    for (const [order, block] of body.blocks.entries()) {
      if (block.id) {
        await prisma.bioBlock.update({
          where: { id: block.id },
          data: {
            kind: block.kind,
            label: block.label,
            url: block.url ?? null,
            subtitle: block.subtitle ?? null,
            imageUrl: block.imageUrl ?? null,
            enabled: block.enabled,
            order,
          },
        });
      } else {
        await prisma.bioBlock.create({
          data: {
            pageId: body.id,
            kind: block.kind,
            label: block.label,
            url: block.url ?? null,
            subtitle: block.subtitle ?? null,
            imageUrl: block.imageUrl ?? null,
            enabled: block.enabled,
            order,
          },
        });
      }
    }

    const page = await prisma.bioPage.update({ where: { id: body.id }, data });
    return ok({ page, blockIds: await blockIdsInOrder(page.id) });
  }

  const page = await prisma.bioPage.create({
    data: {
      ...data,
      workspaceId: workspace.id,
      blocks: {
        create: body.blocks.map((block, order) => ({
          kind: block.kind,
          label: block.label,
          url: block.url ?? null,
          subtitle: block.subtitle ?? null,
          imageUrl: block.imageUrl ?? null,
          enabled: block.enabled,
          order,
        })),
      },
    },
  });

  return ok({ page, blockIds: await blockIdsInOrder(page.id) });
}

/** The saved blocks' ids, in the order they were sent, so the editor can match them up. */
async function blockIdsInOrder(pageId: string): Promise<string[]> {
  const blocks = await prisma.bioBlock.findMany({ where: { pageId }, orderBy: { order: "asc" }, select: { id: true } });
  return blocks.map((b) => b.id);
}

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const page = await prisma.bioPage.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!page) throw new AuthError("Page not found.", 404);

  await prisma.bioPage.delete({ where: { id } });
  return ok();
});
