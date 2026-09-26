"use client";

import * as React from "react";
import { toast } from "sonner";
import { History, Play, RefreshCw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { REWIND_REASON_LABELS } from "@/lib/engine/rewind-labels";
import { timeAgo } from "@/lib/utils";

type Preview = {
  scanned: number;
  eligible: number;
  reasons: Record<string, number>;
  sample: Array<{ username: string; text: string; when: string }>;
};

type Job = {
  id: string;
  status: string;
  eligibleCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  createdAt: string;
  error: string | null;
};

/**
 * Rewind — go back and DM people who commented before this automation existed.
 *
 * The preview is the important part: it says up front how many people are
 * actually reachable and, more usefully, why everyone else isn't.
 */
export function RewindPanel({ automationId }: { automationId: string }) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [checking, setChecking] = React.useState(false);
  const [starting, setStarting] = React.useState(false);

  const loadJobs = React.useCallback(async () => {
    const res = await fetch(`/api/rewind?automationId=${automationId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { jobs?: Job[] };
    setJobs(data.jobs ?? []);
  }, [automationId]);

  React.useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // Poll while a rewind is in flight so progress is visible.
  React.useEffect(() => {
    const active = jobs.some((j) => j.status === "pending" || j.status === "running");
    if (!active) return;
    const timer = setInterval(loadJobs, 3000);
    return () => clearInterval(timer);
  }, [jobs, loadJobs]);

  async function check() {
    setChecking(true);
    try {
      const res = await fetch("/api/rewind", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId }),
      });
      const data = (await res.json()) as { preview?: Preview; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not check");
      setPreview(data.preview ?? null);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function start() {
    if (!preview?.eligible) return;
    if (
      !confirm(
        `Send this automation's starter DM to ${preview.eligible} people who already commented?`,
      )
    ) {
      return;
    }

    setStarting(true);
    try {
      const res = await fetch("/api/rewind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not start the rewind");
      toast.success("Rewind started");
      void loadJobs();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <SectionCard
      title="Rewind"
      description="Built the automation after the post took off? Go back and DM the people who already commented."
      actions={
        <Button variant="secondary" size="sm" onClick={check} loading={checking}>
          <RefreshCw className="h-3.5 w-3.5" />
          Check who&rsquo;s eligible
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] font-medium leading-relaxed text-[var(--text-muted)]">
          Instagram lets you privately reply to a comment for{" "}
          <strong className="text-[var(--text)]">7 days</strong>, exactly{" "}
          <strong className="text-[var(--text)]">once</strong>. Rewind only contacts people who
          still qualify. Everyone else is counted below with the reason.
        </p>

        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-[32px] leading-none tracking-wide">
                {preview.eligible}
              </span>
              <span className="text-[13px] font-bold">
                eligible, out of {preview.scanned.toLocaleString()} comments scanned
              </span>
              {preview.eligible > 0 && (
                <Button variant="pow" size="sm" onClick={start} loading={starting}>
                  <Play className="h-3.5 w-3.5" />
                  Send to all {preview.eligible}
                </Button>
              )}
            </div>

            {preview.sample.length > 0 && (
              <ul className="space-y-1.5">
                {preview.sample.map((s, i) => (
                  <li key={i} className="text-[12.5px] font-medium text-[var(--text-muted)]">
                    <span className="font-extrabold text-[var(--text)]">@{s.username}</span>:
                    &ldquo;{s.text}&rdquo; · {timeAgo(s.when)}
                  </li>
                ))}
                {preview.eligible > preview.sample.length && (
                  <li className="text-[12px] text-[var(--text-faint)]">
                    …and {preview.eligible - preview.sample.length} more
                  </li>
                )}
              </ul>
            )}

            {Object.keys(preview.reasons).length > 0 && (
              <div className="border-t-2 border-[var(--border-soft)] pt-3">
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-faint)]">
                  Not eligible
                </p>
                <ul className="space-y-1">
                  {Object.entries(preview.reasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => (
                      <li
                        key={reason}
                        className="flex items-baseline justify-between gap-3 text-[12.5px]"
                      >
                        <span className="font-medium text-[var(--text-muted)]">
                          {REWIND_REASON_LABELS[reason] ?? reason}
                        </span>
                        <span className="shrink-0 font-extrabold tabular-nums">{count}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {jobs.length > 0 && (
          <div className="border-t-2 border-[var(--border-soft)] pt-3">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-faint)]">
              Previous rewinds
            </p>
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <Badge
                    tone={
                      job.status === "completed"
                        ? "success"
                        : job.status === "failed"
                          ? "danger"
                          : "brand"
                    }
                  >
                    {job.status}
                  </Badge>
                  <span className="font-medium text-[var(--text-muted)]">
                    {job.sentCount} sent · {job.skippedCount} skipped
                    {job.failedCount > 0 && ` · ${job.failedCount} failed`} ·{" "}
                    {timeAgo(job.createdAt)}
                  </span>
                  {job.error && (
                    <span className="text-[12px] font-bold text-[var(--color-zap-500)]">
                      {job.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!preview && jobs.length === 0 && (
          <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-muted)]">
            <History className="h-4 w-4" />
            Check eligibility to see who this would reach.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
