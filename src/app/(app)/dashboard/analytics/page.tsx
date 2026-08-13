import Link from "next/link";
import { BarChart3, MousePointerClick, Send, Sparkles, UserPlus, Zap } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { getAccountIds, getAutomationPerformance, getOverviewStats } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { formatPercent } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { PageHeader, SectionCard, StatCard } from "@/components/dashboard/bits";
import { ActivityChart } from "@/components/dashboard/charts";

export default async function AnalyticsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const accountIds = await getAccountIds(workspace.id);

  const [stats, automations, topLinks] = await Promise.all([
    getOverviewStats(workspace.id, 30),
    getAutomationPerformance(workspace.id, 30),
    prisma.trackedLink.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { clickCount: "desc" },
      take: 8,
    }),
  ]);

  if (accountIds.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Analytics" />
        <EmptyState
          icon={<BarChart3 />}
          title="Nothing to measure yet"
          description="Connect an Instagram account and switch on an automation — numbers start landing here immediately."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Analytics" description="The last 30 days across every connected account." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Triggered" value={stats.triggered} icon={<Zap />} tone="brand" />
        <StatCard label="DMs sent" value={stats.sent} icon={<Send />} tone="success" />
        <StatCard
          label="Opened"
          value={stats.opened}
          hint={formatPercent(stats.openRate)}
          icon={<Sparkles />}
        />
        <StatCard
          label="Clicked"
          value={stats.clicked}
          hint={`${formatPercent(stats.ctr)} CTR`}
          icon={<MousePointerClick />}
        />
        <StatCard label="Leads captured" value={stats.leads} />
        <StatCard
          label="New followers"
          value={stats.newFollowers}
          hint="attributed to automations"
          icon={<UserPlus />}
        />
      </div>

      <SectionCard title="Activity" description="Daily totals over the last 30 days.">
        <ActivityChart data={stats.series} />
      </SectionCard>

      <SectionCard
        title="By automation"
        description="Sorted by how often each one fired."
      >
        {automations.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">
            No automations yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <thead className="border-b-2 border-[var(--border-soft)]">
                <tr>
                  <th className="pb-2.5 text-[11.5px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
                    Automation
                  </th>
                  {["Triggered", "Sent", "Opened", "Clicked", "CTR", "Leads"].map((header) => (
                    <th
                      key={header}
                      className="pb-2.5 text-right text-[11.5px] font-medium uppercase tracking-wider text-[var(--text-faint)]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...automations]
                  .sort((a, b) => b.metrics.triggered - a.metrics.triggered)
                  .map((automation) => (
                    <tr
                      key={automation.id}
                      className="border-b-2 border-[var(--border-soft)] last:border-0"
                    >
                      <td className="py-2.5">
                        <Link
                          href={`/dashboard/automations/${automation.id}`}
                          className="font-medium hover:text-[var(--accent)]"
                        >
                          {automation.name}
                        </Link>
                        <span className="block text-[11.5px] text-[var(--text-faint)]">
                          @{automation.account.username} ·{" "}
                          {automation.enabled ? "live" : "paused"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {automation.metrics.triggered.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {automation.metrics.sent.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {automation.metrics.opened.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {automation.metrics.clicked.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatPercent(automation.metrics.ctr, 0)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {automation.metrics.leads.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Link clicks" description="Tracked links sent through your DMs.">
        {topLinks.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">
            No tracked links yet. Create one from Templates to start measuring clicks.
          </p>
        ) : (
          <ul className="divide-y-2 divide-[var(--border-soft)]">
            {topLinks.map((link) => (
              <li key={link.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">
                    {link.label ?? link.destination}
                  </p>
                  <p className="truncate text-[11.5px] text-[var(--text-faint)]">
                    {link.destination}
                  </p>
                </div>
                <span className="shrink-0 text-[13.5px] font-medium tabular-nums">
                  {link.clickCount.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
