import { getActiveWorkspace } from "@/lib/auth";
import { listConversations } from "@/lib/inbox";
import { PageHeader } from "@/components/dashboard/bits";
import { InboxView } from "@/components/dashboard/inbox";

export default async function InboxPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const conversations = await listConversations(workspace.id);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Inbox"
        description="Every conversation across your connected accounts. Jump in whenever automation should step aside."
      />
      <InboxView conversations={conversations} loadedAt={new Date().toISOString()} />
    </div>
  );
}
