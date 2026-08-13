import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { addCodes, generateCodes, poolStats } from "@/lib/engine/coupons";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  mode: z.enum(["SHARED", "UNIQUE"]).default("UNIQUE"),
  sharedCode: z.string().max(60).optional(),
  description: z.string().max(500).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  /** Paste existing codes… */
  codes: z.string().max(200_000).optional(),
  /** …or generate them. */
  generate: z
    .object({ prefix: z.string().max(20).default(""), count: z.number().int().min(1).max(10_000) })
    .optional(),
});

export const GET = route(async ({ workspace }) => {
  const pools = await prisma.couponPool.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  const withStats = await Promise.all(
    pools.map(async (pool) => ({ ...pool, stats: await poolStats(pool.id) })),
  );
  return ok({ pools: withStats });
});

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, createSchema);

  if (body.mode === "SHARED" && !body.sharedCode) {
    return Response.json(
      { error: "A shared pool needs the code everyone will receive." },
      { status: 400 },
    );
  }

  const pool = await prisma.couponPool.create({
    data: {
      workspaceId: workspace.id,
      name: body.name,
      mode: body.mode,
      sharedCode: body.mode === "SHARED" ? (body.sharedCode ?? null) : null,
      description: body.description ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  let added = 0;
  if (body.mode === "UNIQUE") {
    if (body.codes) {
      added = await addCodes(pool.id, body.codes);
    } else if (body.generate) {
      const codes = generateCodes(body.generate.prefix, body.generate.count);
      added = await addCodes(pool.id, codes.join("\n"));
    }
  }

  return ok({ pool, added });
});

const updateSchema = z.object({
  id: z.string().min(1),
  /** Top a pool up with more codes. */
  codes: z.string().max(200_000).optional(),
  generate: z
    .object({ prefix: z.string().max(20).default(""), count: z.number().int().min(1).max(10_000) })
    .optional(),
});

export const PATCH = route(async ({ workspace, request }) => {
  const body = await parseBody(request, updateSchema);

  const pool = await prisma.couponPool.findFirst({
    where: { id: body.id, workspaceId: workspace.id },
  });
  if (!pool) throw new AuthError("Coupon pool not found.", 404);

  let added = 0;
  if (body.codes) added = await addCodes(pool.id, body.codes);
  else if (body.generate) {
    added = await addCodes(pool.id, generateCodes(body.generate.prefix, body.generate.count).join("\n"));
  }

  return ok({ added, stats: await poolStats(pool.id) });
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const pool = await prisma.couponPool.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!pool) throw new AuthError("Coupon pool not found.", 404);

  await prisma.couponPool.delete({ where: { id } });
  return ok();
});
