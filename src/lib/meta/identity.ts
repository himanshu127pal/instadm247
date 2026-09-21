import type { Prisma } from "@prisma/client";

/**
 * Match an Instagram account by either identifier.
 *
 * Instagram Login issues two: the app-scoped ID from the token exchange, and
 * the Instagram professional account ID from /me. Different Meta surfaces send
 * different ones — webhook payloads carry the professional ID, while the signed
 * request on the deauthorize and data-deletion callbacks carries the app-scoped
 * one — and an account connected before we stored both is keyed on whichever we
 * happened to save.
 *
 * Every lookup that starts from an ID Meta gave us goes through here. Matching
 * one identifier and not the other is how a callback silently does nothing.
 */
export function byEitherInstagramId(id: string): Prisma.InstagramAccountWhereInput {
  return { OR: [{ igUserId: id }, { igScopedId: id }] };
}
