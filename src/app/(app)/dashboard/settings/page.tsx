import { getActiveWorkspace, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader, SectionCard } from "@/components/dashboard/bits";

export default async function SettingsPage() {
  const [user, workspace] = await Promise.all([getCurrentUser(), getActiveWorkspace()]);
  if (!user || !workspace) return null;

  const [accountCount, waitingRuns] = await Promise.all([
    prisma.instagramAccount.count({ where: { workspaceId: workspace.id } }),
    prisma.flowRun.count({
      where: { account: { workspaceId: workspace.id }, status: "waiting" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        description="Your account, and the limits your sending runs under."
      />

      <SectionCard title="Your account">
        <dl className="space-y-3">
          {[
            ["Name", user.name ?? "—"],
            ["Email", user.email],
            ["Workspace", workspace.name],
            ["Instagram accounts", String(accountCount)],
            ["Flows waiting to resume", String(waitingRuns)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
              <dd className="text-[13.5px] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard title="Sending limits">
        <dl className="space-y-3">
          {[
            [
              "DMs per hour, per account",
              String(env.limits.messagesPerHour),
              "Deliberately under Meta's published ceiling.",
            ],
            [
              "Private replies per hour",
              String(env.limits.privateRepliesPerHour),
              "Replies to comments use a separate allowance.",
            ],
            [
              "Slow Down mode",
              "2 hours",
              "Halves throughput. Armed automatically when Instagram throttles you.",
            ],
          ].map(([label, value, hint]) => (
            <div key={label}>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
                <dd className="text-[13.5px] font-medium tabular-nums">{value}</dd>
              </div>
              <p className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">{hint}</p>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}
