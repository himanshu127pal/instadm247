import { prisma } from "@/lib/db";

/**
 * DM Coupons (LinkDM feature #22).
 *
 * Two modes:
 *   SHARED — everyone gets the same code (a public promo)
 *   UNIQUE — each person gets their own code from a pool, and never a second one
 *
 * UNIQUE is the one that needs care: the same person must never burn two codes,
 * and two concurrent flows must never hand out the same code. Both are enforced
 * by unique constraints on `CouponCode`, not by application logic.
 */

export type IssueResult =
  | { ok: true; code: string; reused: boolean }
  | { ok: false; reason: "pool_empty" | "pool_missing" | "expired" };

/**
 * Hand a code to a contact.
 *
 * Idempotent: calling it twice for the same contact returns the code they
 * already have, so a retried flow step doesn't consume a second one.
 */
export async function issueCoupon(poolId: string, contactId: string): Promise<IssueResult> {
  const pool = await prisma.couponPool.findUnique({ where: { id: poolId } });
  if (!pool) return { ok: false, reason: "pool_missing" };
  if (pool.expiresAt && pool.expiresAt < new Date()) return { ok: false, reason: "expired" };

  if (pool.mode === "SHARED") {
    return pool.sharedCode
      ? { ok: true, code: pool.sharedCode, reused: false }
      : { ok: false, reason: "pool_empty" };
  }

  // Already issued to this person? Give them the same one back.
  const existing = await prisma.couponCode.findUnique({
    where: { poolId_contactId: { poolId, contactId } },
  });
  if (existing) return { ok: true, code: existing.code, reused: true };

  // Claim an unissued code. `updateMany` with a null guard is the atomic bit:
  // two concurrent callers can't both claim the same row.
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await prisma.couponCode.findFirst({
      where: { poolId, contactId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true },
    });
    if (!next) return { ok: false, reason: "pool_empty" };

    const claimed = await prisma.couponCode.updateMany({
      where: { id: next.id, contactId: null },
      data: { contactId, issuedAt: new Date() },
    });
    if (claimed.count === 1) return { ok: true, code: next.code, reused: false };
    // Lost the race — another caller took it. Try the next one.
  }

  return { ok: false, reason: "pool_empty" };
}

export async function poolStats(poolId: string) {
  const [total, issued] = await Promise.all([
    prisma.couponCode.count({ where: { poolId } }),
    prisma.couponCode.count({ where: { poolId, contactId: { not: null } } }),
  ]);
  return { total, issued, remaining: total - issued };
}

/** Bulk-load codes, ignoring duplicates and blank lines. */
export async function addCodes(poolId: string, raw: string): Promise<number> {
  const codes = [
    ...new Set(
      raw
        .split(/[\s,;\n]+/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
  if (codes.length === 0) return 0;

  const result = await prisma.couponCode.createMany({
    data: codes.map((code) => ({ poolId, code })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Generate codes rather than pasting them in. */
export function generateCodes(prefix: string, count: number, length = 6): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seen = new Set<string>();

  while (seen.size < count) {
    let suffix = "";
    for (let i = 0; i < length; i++) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    seen.add(prefix ? `${prefix}-${suffix}` : suffix);
  }
  return [...seen];
}

/** Warn the owner before a pool runs dry mid-campaign. */
export async function lowStockPools(workspaceId: string, threshold = 10) {
  const pools = await prisma.couponPool.findMany({
    where: { workspaceId, mode: "UNIQUE" },
    include: { _count: { select: { codes: true } } },
  });

  const low: Array<{ id: string; name: string; remaining: number }> = [];
  for (const pool of pools) {
    const { remaining } = await poolStats(pool.id);
    if (remaining <= threshold) low.push({ id: pool.id, name: pool.name, remaining });
  }
  return low;
}
