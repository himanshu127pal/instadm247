import Link from "next/link";
import { MessageSquare, Plus, Workflow, Zap } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { getAutomationPerformance } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { formatPercent, timeAgo } from "@/lib/utils";
import { Badge, Button, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/bits";
import { AutomationToggle } from "@/components/dashboard/automation-toggle";

const TRIGGER_LABELS: Record<string, string> = {
  COMMENT: "Comment",
  AD_COMMENT: "Ad comment",
  LIVE_COMMENT: "Live comment",
  STORY_REPLY: "Story reply",
  STORY_MENTION: "Story mention",
  DM_KEYWORD: "DM keyword",
  ICE_BREAKER: "Conversation starter",
  POSTBACK: "Button click",
  REFERRAL: "Referral link",
};

const SCOPE_LABELS: Record<string, string> = {
  SPECIFIC: "Selected posts",
  ALL_MEDIA: "All posts",
  UNIVERSAL: "Everything",
  AD: "Ads only",
};

export default async function AutomationsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [automations, accountCount] = await Promise.all([
    getAutomationPerformance(workspace.id, 30),
    prisma.instagramAccount.count({ where: { workspaceId: workspace.id } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Automations"
        description="Each one listens for something on Instagram and runs a flow when it happens."
        actions={
          accountCount > 0 && (
            <Link href="/dashboard/automations/new">
              <Button variant="gradient">
                <Plus className="h-4 w-4" />
                New automation
              </Button>
            </Link>
          )
        }
      />

      {accountCount === 0 ? (
        <EmptyState
          icon={<Workflow />}
          title="Connect Instagram first"
          description="Automations listen to a specific Instagram account, so you'll need to connect one before building anything."
          action={
            <Link href="/dashboard/accounts">
              <Button variant="gradient">Connect an account</Button>
            </Link>
          }
        />
      ) : automations.length === 0 ? (
        <EmptyState
          icon={<Zap />}
          title="No automations yet"
          description="Start from a template — comment-to-DM takes about a minute to set up."
          action={
            <Link href="/dashboard/automations/new">
              <Button variant="gradient">
                <Plus className="h-4 w-4" /> Create your first
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <article
              key={automation.id}
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-5 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/automations/${automation.id}`}
                      className="text-[15.5px] font-semibold hover:text-[var(--accent)]"
                    >
                      {automation.name}
                    </Link>
                    <Badge tone={automation.enabled ? "success" : "neutral"}>
                      {automation.enabled ? "Live" : "Paused"}
                    </Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      {TRIGGER_LABELS[automation.triggerType] ?? automation.triggerType}
                    </span>
                    <span>·</span>
                    <span>{SCOPE_LABELS[automation.scope] ?? automation.scope}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {automation.stepCount} step{automation.stepCount === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>@{automation.account.username}</span>
                  </div>

                  {automation.matchMode === "KEYWORD" && automation.keywords.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {automation.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-lg bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[11px] text-[var(--accent)]"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                  {automation.matchMode === "ALL" && (
                    <p className="mt-2.5 text-[12px] text-[var(--text-faint)]">
                      Responds to everything — no keyword needed.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <dl className="hidden gap-5 sm:flex">
                    {[
                      { label: "Triggered", value: automation.metrics.triggered },
                      { label: "Sent", value: automation.metrics.sent },
                      { label: "CTR", value: formatPercent(automation.metrics.ctr, 0) },
                    ].map((metric) => (
                      <div key={metric.label} className="text-right">
                        <dt className="text-[10.5px] uppercase tracking-wider text-[var(--text-faint)]">
                          {metric.label}
                        </dt>
                        <dd className="text-[16px] font-semibold tabular-nums">
                          {typeof metric.value === "number"
                            ? metric.value.toLocaleString()
                            : metric.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <AutomationToggle id={automation.id} enabled={automation.enabled} />
                </div>
              </div>

              <p className="mt-3 border-t border-[var(--border)] pt-3 text-[11.5px] text-[var(--text-faint)]">
                Updated {timeAgo(automation.updatedAt)} · {automation._count.runs.toLocaleString()}{" "}
                total run{automation._count.runs === 1 ? "" : "s"}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
