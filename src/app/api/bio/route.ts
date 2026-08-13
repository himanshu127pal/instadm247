import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";

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
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
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

  // Slugs are global — someone else may already have it.
  const clash = await prisma.bioPage.findFirst({
    where: { slug: body.slug, ...(body.id ? { NOT: { id: body.id } } : {}) },
    select: { id: true },
  });
  if (clash) {
    return Response.json({ error: `The link /l/${body.slug} is already taken.` }, { status: 409 });
  }

  const data = {
    slug: body.slug,
    title: body.title,
    bio: body.bio ?? null,
    avatarUrl: body.avatarUrl ?? null,
    theme: body.theme,
    published: body.published,
    showBadge: body.showBadge,
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
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const page = await prisma.bioPage.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!page) throw new AuthError("Page not found.", 404);

  await prisma.bioPage.delete({ where: { id } });
  return ok();
});
