import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/bits";
import { PlannerView } from "@/components/dashboard/planner-view";

export default async function PlannerPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [accounts, planned, automations] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, username: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.plannedAutomation.findMany({
      where: { account: { workspaceId: workspace.id } },
      include: {
        account: { select: { username: true } },
        automation: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.automation.findMany({
      where: { account: { workspaceId: workspace.id } },
      select: { id: true, name: true, accountId: true, enabled: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="DM Planner"
        description="Write the automation before the post exists. Drop the draft code in your caption and it wires itself up the moment you publish, from any scheduler."
      />
      <PlannerView
        accounts={accounts}
        automations={automations}
        planned={planned.map((p) => ({
          id: p.id,
          name: p.name,
          mode: p.mode,
          draftCode: p.draftCode,
          status: p.status,
          accountUsername: p.account.username,
          automationName: p.automation?.name ?? null,
          automationId: p.automation?.id ?? null,
          matchedAt: p.matchedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
