import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { checkSlug, SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@/lib/bio-slug";
import { isBranded } from "@/lib/branding";

export const runtime = "nodejs";

const blockSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["LINK", "HEADING", "TEXT", "SOCIAL", "EMAIL", "WHATSAPP", "PRODUCT"]),
  label: z.string().min(1).max(120),
  url: z.string().max(500).nullable().optional(),
  subtitle: z.string().max(160).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
});

const upsertSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .min(SLUG_MIN)
    .max(SLUG_MAX)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens only"),
  title: z.string().min(1).max(80),
  bio: z.string().max(300).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  theme: z.enum(["comic", "midnight", "punch", "mint", "sky"]).default("comic"),
  published: z.boolean().default(true),
  showBadge: z.boolean().default(true),
  accountId: z.string().nullable().optional(),
  blocks: z.array(blockSchema).max(50).default([]),
});

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
    return ok({ page });
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

  return ok({ page });
}

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const page = await prisma.bioPage.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!page) throw new AuthError("Page not found.", 404);

  await prisma.bioPage.delete({ where: { id } });
  return ok();
});
