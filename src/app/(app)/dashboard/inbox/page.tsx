import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/bits";
import { InboxView } from "@/components/dashboard/inbox";

export default async function InboxPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const conversations = await prisma.conversation.findMany({
    where: { account: { workspaceId: workspace.id } },
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

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Inbox"
        description="Every conversation across your connected accounts. Jump in whenever automation should step aside."
      />
      <InboxView
        conversations={conversations.map((c) => ({
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
        }))}
      />
    </div>
  );
}
