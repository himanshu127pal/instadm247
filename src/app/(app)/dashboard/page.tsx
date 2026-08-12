import Link from "next/link";
import {
  ArrowRight,
  Inbox,
  Aperture,
  MousePointerClick,
  Send,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOverviewStats } from "@/lib/queries";
import { formatPercent, timeAgo } from "@/lib/utils";
import { Badge, Button, EmptyState } from "@/components/ui";
import { PageHeader, SectionCard, StatCard } from "@/components/dashboard/bits";
import { ActivityChart } from "@/components/dashboard/charts";

export default async function DashboardPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [stats, accounts, recentRuns, topAutomations] = await Promise.all([
    getOverviewStats(workspace.id, 14),
    prisma.instagramAccount.count({ where: { workspaceId: workspace.id } }),
    prisma.flowRun.findMany({
      where: { account: { workspaceId: workspace.id } },
      include: {
        automation: { select: { name: true } },
        contact: { select: { username: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.automation.findMany({
      where: { account: { workspaceId: workspace.id }, enabled: true },
      include: { account: { select: { username: true } }, _count: { select: { runs: true } } },
      orderBy: { runs: { _count: "desc" } },
      take: 5,
    }),
  ]);

  if (accounts === 0) return <FirstRun />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Dashboard"
        description="How your automations performed over the last 14 days."
        actions={
          <Link href="/dashboard/automations/new">
            <Button variant="gradient">
              <Sparkles className="h-4 w-4" />
              New automation
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Automations triggered"
          value={stats.triggered}
          icon={Zap}
          tone="brand"
          hint="last 14 days"
        />
        <StatCard label="DMs sent" value={stats.sent} icon={Send} tone="success" hint="last 14 days" />
        <StatCard
          label="Open rate"
          value={formatPercent(stats.openRate)}
          icon={Inbox}
          hint={`${stats.opened.toLocaleString()} opened`}
        />
        <StatCard
          label="Click-through rate"
          value={formatPercent(stats.ctr)}
          icon={MousePointerClick}
          hint={`${stats.clicked.toLocaleString()} clicks`}
        />
      </div>

      <SectionCard
        title="Activity"
        description="Triggers, sends, opens and clicks per day."
        className="overflow-hidden"
      >
        <ActivityChart data={stats.series} />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <SectionCard
          title="Recent runs"
          actions={
            <Link href="/dashboard/analytics">
              <Button variant="ghost" size="sm">
                All activity <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        >
          {recentRuns.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title="No runs yet"
              description="As soon as someone comments or replies, their journey shows up here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recentRuns.map((run) => (
                <li key={run.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--bg-sunken)] text-[11px] font-semibold">
                    {(run.contact.username ?? run.contact.name ?? "?")[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px]">
                      <span className="font-medium">
                        @{run.contact.username ?? "someone"}
                      </span>{" "}
                      <span className="text-[var(--text-muted)]">entered</span>{" "}
                      {run.automation.name}
                    </p>
                    <p className="text-[11.5px] text-[var(--text-faint)]">
                      {run.triggerType.toLowerCase().replace(/_/g, " ")} ·{" "}
                      {timeAgo(run.startedAt)}
                    </p>
                  </div>
                  <RunBadge status={run.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="Busiest automations">
            {topAutomations.length === 0 ? (
              <EmptyState icon={Zap} title="Nothing running yet" />
            ) : (
              <ul className="space-y-2.5">
                {topAutomations.map((automation, i) => (
                  <li key={automation.id}>
                    <Link
                      href={`/dashboard/automations/${automation.id}`}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[var(--accent)]/10 text-[11px] font-semibold text-[var(--accent)]">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">
                          {automation.name}
                        </span>
                        <span className="block text-[11.5px] text-[var(--text-faint)]">
                          @{automation.account.username}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">
                        {automation._count.runs.toLocaleString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="At a glance">
            <dl className="space-y-3">
              {[
                { label: "Contacts", value: stats.contacts.toLocaleString(), icon: Users },
                { label: "Active automations", value: stats.activeAutomations, icon: Workflow },
                { label: "Unread conversations", value: stats.openConversations, icon: Inbox },
                { label: "Leads captured", value: stats.leads.toLocaleString(), icon: Sparkles },
                { label: "New followers", value: stats.newFollowers.toLocaleString(), icon: Users },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                    <dt className="flex-1 text-[13px] text-[var(--text-muted)]">{row.label}</dt>
                    <dd className="text-[13.5px] font-medium tabular-nums">{row.value}</dd>
                  </div>
                );
              })}
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function RunBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "success" | "brand" | "warning" | "neutral"; label: string }> = {
    completed: { tone: "success", label: "Completed" },
    running: { tone: "brand", label: "Running" },
    waiting: { tone: "brand", label: "Waiting" },
    halted: { tone: "neutral", label: "Stopped" },
    failed: { tone: "warning", label: "Failed" },
  };
  const config = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function FirstRun() {
  const steps = [
    {
      icon: Aperture,
      title: "Connect Instagram",
      body: "Sign in through Meta's own screen and grant messaging permissions. Takes about 30 seconds.",
      href: "/dashboard/accounts",
      cta: "Connect account",
    },
    {
      icon: Workflow,
      title: "Build your first automation",
      body: "Pick a trigger, write the DM, add follow-ups. Start from a template if you'd rather not begin blank.",
      href: "/dashboard/automations/new",
      cta: "Create automation",
    },
    {
      icon: Send,
      title: "Watch it run",
      body: "Every trigger, send, open and click lands on your dashboard in real time.",
      href: "/dashboard/analytics",
      cta: "See analytics",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-flare-500))] text-white">
          <Sparkles className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-[26px] font-semibold tracking-tight">
          Let&rsquo;s get your DMs working for you
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-[var(--text-muted)]">
          Three steps and every comment, story reply and mention starts turning into a
          conversation.
        </p>
      </div>

      <ol className="mt-9 space-y-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-5"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--bg-sunken)] text-[var(--accent)]">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-[200px] flex-1">
                <p className="text-[14.5px] font-semibold">
                  <span className="mr-2 text-[var(--text-faint)]">{i + 1}.</span>
                  {step.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {step.body}
                </p>
              </div>
              <Link href={step.href}>
                <Button variant={i === 0 ? "gradient" : "secondary"} size="sm">
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
