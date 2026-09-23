import { redirect } from "next/navigation";
import { getActiveWorkspace, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, isEmailConfigured, isInstagramConfigured } from "@/lib/env";
import { getPlatformStaff } from "@/lib/admin";
import { DashboardShell } from "@/components/dashboard/shell";
import { getImpersonation } from "@/lib/impersonation";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { VerifyEmailBanner } from "@/components/dashboard/verify-email-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getActiveWorkspace();
  if (!workspace) redirect("/login");

  const impersonation = await getImpersonation();

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
    <>
      {impersonation && (
        <ImpersonationBanner
          email={user.email}
          byEmail={impersonation.byEmail}
          expiresAt={impersonation.expiresAt.toISOString()}
        />
      )}
      {/* Only when we can actually send one — otherwise it's a promise we can't keep. */}
      {!impersonation && !user.emailVerified && isEmailConfigured() && <VerifyEmailBanner email={user.email} />}
      <DashboardShell
      user={user}
      workspace={workspace}
      accounts={accounts}
      instagramConfigured={isInstagramConfigured()}
      showBilling={env.billing.enabled || Boolean(await getPlatformStaff())}
    >
        {children}
      </DashboardShell>
    </>
  );
}
