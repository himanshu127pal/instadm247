import { Download, Users } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccountIds } from "@/lib/queries";
import { Button, EmptyState } from "@/components/ui";
import { PageHeader, StatCard } from "@/components/dashboard/bits";
import { ContactsTable } from "@/components/dashboard/contacts-table";

export default async function ContactsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const accountIds = await getAccountIds(workspace.id);

  const [contacts, total, reachable, followers, optedOut] = await Promise.all([
    prisma.contact.findMany({
      where: { accountId: { in: accountIds } },
      include: { account: { select: { username: true } } },
      orderBy: { lastInteractionAt: "desc" },
      take: 300,
    }),
    prisma.contact.count({ where: { accountId: { in: accountIds } } }),
    prisma.contact.count({
      where: { accountId: { in: accountIds }, windowExpiresAt: { gt: new Date() }, optedOut: false },
    }),
    prisma.contact.count({ where: { accountId: { in: accountIds }, isFollower: true } }),
    prisma.contact.count({ where: { accountId: { in: accountIds }, optedOut: true } }),
  ]);

  const allTags = [...new Set(contacts.flatMap((c) => c.tags))].sort();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Contacts"
        description="Everyone who has interacted with your automations, and what you know about them."
        actions={
          contacts.length > 0 && (
            <a href="/api/contacts/export" download>
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </a>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total contacts" value={total} icon={Users} tone="brand" />
        <StatCard
          label="Reachable now"
          value={reachable}
          hint="messaging window still open"
          tone="success"
        />
        <StatCard label="Following you" value={followers} />
        <StatCard label="Opted out" value={optedOut} tone={optedOut > 0 ? "warning" : "neutral"} />
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Contacts are created automatically the first time someone comments, replies to a story or messages you."
        />
      ) : (
        <ContactsTable
          contacts={contacts.map((c) => ({
            id: c.id,
            igsid: c.igsid,
            username: c.username,
            name: c.name,
            profilePicUrl: c.profilePicUrl,
            tags: c.tags,
            isFollower: c.isFollower,
            optedOut: c.optedOut,
            lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
            windowExpiresAt: c.windowExpiresAt?.toISOString() ?? null,
            accountUsername: c.account.username,
            customFields: (c.customFields as Record<string, unknown>) ?? {},
          }))}
          allTags={allTags}
        />
      )}
    </div>
  );
}
