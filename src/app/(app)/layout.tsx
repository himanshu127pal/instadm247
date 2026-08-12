import { redirect } from "next/navigation";
import { getActiveWorkspace, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isInstagramConfigured, missingInstagramConfig } from "@/lib/env";
import { DashboardShell } from "@/components/dashboard/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getActiveWorkspace();
  if (!workspace) redirect("/login");

  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    select: {
      id: true,
      username: true,
      profilePictureUrl: true,
      status: true,
      automationPaused: true,
      slowDownUntil: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <DashboardShell
      user={user}
      workspace={workspace}
      accounts={accounts}
      instagramConfigured={isInstagramConfigured()}
      missingConfig={missingInstagramConfig()}
    >
      {children}
    </DashboardShell>
  );
}
