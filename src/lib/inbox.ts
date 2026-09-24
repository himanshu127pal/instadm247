import { prisma } from "@/lib/db";

/**
 * The Inbox's conversation list, shaped for the client. Used for the first
 * render and for the live refresh, so both return exactly the same thing.
 */
export async function listConversations(workspaceId: string, since?: Date) {
  const conversations = await prisma.conversation.findMany({
    where: {
      account: { workspaceId },
      ...(since ? { updatedAt: { gt: since } } : {}),
    },
    include: {
      contact: {
        select: {
          id: true,
          igsid: true,
          username: true,
          name: true,
          profilePicUrl: true,
          tags: true,
          isFollower: true,
          windowExpiresAt: true,
          optedOut: true,
        },
      },
      account: { select: { id: true, username: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  return conversations.map((c) => ({
    id: c.id,
    accountId: c.accountId,
    accountUsername: c.account.username,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: c.lastMessagePreview,
    unreadCount: c.unreadCount,
    status: c.status,
    humanTakeover: c.humanTakeover,
    contact: {
      ...c.contact,
      windowExpiresAt: c.contact.windowExpiresAt?.toISOString() ?? null,
    },
  }));
}

export type InboxConversation = Awaited<ReturnType<typeof listConversations>>[number];
