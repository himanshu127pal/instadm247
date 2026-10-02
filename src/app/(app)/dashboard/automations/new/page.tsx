import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PRESETS } from "@/lib/engine/presets";
import { PageHeader } from "@/components/dashboard/bits";
import { NewAutomationWizard } from "@/components/dashboard/new-automation";

export default async function NewAutomationPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, username: true, profilePictureUrl: true },
    orderBy: { createdAt: "asc" },
  });
  if (accounts.length === 0) redirect("/dashboard/accounts");

  const existing = await prisma.automation.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    select: { accountId: true, name: true },
  });

  const media = await prisma.media.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    orderBy: { timestamp: "desc" },
    take: 60,
    select: {
      id: true,
      accountId: true,
      igMediaId: true,
      caption: true,
      mediaType: true,
      thumbnailUrl: true,
      mediaUrl: true,
      permalink: true,
      timestamp: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New automation"
        description="Pick what starts it, what it listens for, and a flow to begin from."
      />
      <NewAutomationWizard
        accounts={accounts}
        media={media.map((m) => ({ ...m, timestamp: m.timestamp?.toISOString() ?? null }))}
        existingNames={existing}
        presets={PRESETS.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          triggerType: p.triggerType,
          matchMode: p.matchMode,
          keywords: p.keywords,
        }))}
      />
    </div>
  );
}
