import { prisma } from "@/lib/db";
import { publicRoute } from "@/lib/api-keys";
import { getAccountIds } from "@/lib/queries";

export const runtime = "nodejs";

/**
 * GET /api/v1/contacts — the customer-facing contact list.
 *
 * Auth: Authorization: Bearer <api key>
 * Query: ?limit=50&cursor=<id>&tag=lead&reachable=true
 */
export const GET = publicRoute("read", async (ctx, request) => {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 50), 1), 200);
  const cursor = params.get("cursor");
  const tag = params.get("tag");
  const reachable = params.get("reachable") === "true";

  const accountIds = await getAccountIds(ctx.workspaceId);
  if (accountIds.length === 0) return Response.json({ data: [], next_cursor: null });

  const contacts = await prisma.contact.findMany({
    where: {
      accountId: { in: accountIds },
      ...(tag ? { tags: { has: tag } } : {}),
      ...(reachable ? { windowExpiresAt: { gt: new Date() }, optedOut: false } : {}),
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { account: { select: { username: true } } },
  });

  const hasMore = contacts.length > limit;
  const page = hasMore ? contacts.slice(0, limit) : contacts;

  return Response.json({
    data: page.map((c) => ({
      id: c.id,
      instagram_scoped_id: c.igsid,
      username: c.username,
      name: c.name,
      account: c.account.username,
      tags: c.tags,
      custom_fields: c.customFields,
      is_follower: c.isFollower,
      opted_out: c.optedOut,
      messaging_window_expires_at: c.windowExpiresAt?.toISOString() ?? null,
      last_interaction_at: c.lastInteractionAt?.toISOString() ?? null,
      created_at: c.firstSeenAt.toISOString(),
    })),
    next_cursor: hasMore ? page.at(-1)?.id : null,
  });
});
