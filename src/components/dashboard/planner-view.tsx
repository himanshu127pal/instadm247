"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select } from "@/components/ui";
import { CopyField, SectionCard } from "@/components/dashboard/bits";
import { timeAgo } from "@/lib/utils";

type Planned = {
  id: string;
  name: string;
  mode: string;
  draftCode: string;
  status: string;
  accountUsername: string;
  automationName: string | null;
  automationId: string | null;
  matchedAt: string | null;
  createdAt: string;
};

export function PlannerView({
  accounts,
  automations,
  planned,
}: {
  accounts: Array<{ id: string; username: string }>;
  automations: Array<{ id: string; name: string; accountId: string; enabled: boolean }>;
  planned: Planned[];
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);

  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [automationId, setAutomationId] = React.useState("");
  const [name, setName] = React.useState("");
  const [mode, setMode] = React.useState<"DRAFT_CODE" | "NEXT_POST">("DRAFT_CODE");
  const [saving, setSaving] = React.useState(false);

  const accountAutomations = automations.filter((a) => a.accountId === accountId);

  async function create() {
    if (!automationId) {
      toast.error("Pick which automation should activate.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          automationId,
          mode,
          name: name.trim() || "Planned automation",
        }),
      });
      const data = (await res.json()) as { error?: string; planned?: { draftCode: string } };
      if (!res.ok) throw new Error(data.error ?? "Could not create the plan");

      toast.success(
        mode === "NEXT_POST"
          ? "Ready. It'll attach to your next post automatically"
          : `Draft code ${data.planned?.draftCode} is ready. Put it in your caption`,
      );
      setCreating(false);
      setName("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function scanNow() {
    setScanning(true);
    try {
      const res = await fetch("/api/planner", { method: "PUT" });
      const data = (await res.json()) as { matched?: number };
      toast.success(
        data.matched ? `Matched ${data.matched} post${data.matched === 1 ? "" : "s"}` : "No new posts carrying a draft code yet",
      );
      router.refresh();
    } catch {
      toast.error("Could not scan right now.");
    } finally {
      setScanning(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch("/api/planner", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success("Plan removed");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard title="How this works">
        <ol className="space-y-2.5">
          {[
            "Build the automation as normal: keywords, flow, everything.",
            "Create a plan here and you get a short draft code like DM-K7QP2X.",
            "Paste that code anywhere in the caption of the post you're about to publish.",
            "Publish however you like: manually, Later, Buffer, Meta Suite. We spot the code within five minutes, attach the automation to that exact post, and switch it on.",
            "No code to hand? Pick \"Next post\" instead and it latches onto whatever you publish next.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--accent)]/12 text-[11px] font-semibold text-[var(--accent)]">
                {i + 1}
              </span>
              <span className="text-[var(--text-muted)]">{step}</span>
            </li>
          ))}
        </ol>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 0 && (
          <Button variant="gradient" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" />
            Plan an automation
          </Button>
        )}
        {planned.some((p) => p.status === "waiting") && (
          <Button variant="secondary" onClick={scanNow} loading={scanning}>
            <RefreshCw className="h-4 w-4" />
            Check for the post now
          </Button>
        )}
      </div>

      {creating && (
        <SectionCard title="New plan">
          <div className="space-y-4">
            {accounts.length > 1 && (
              <Field label="Account">
                <Select
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    setAutomationId("");
                  }}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      @{account.username}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label="Automation to activate"
              hint="It'll be switched off until the post goes live."
            >
              <Select value={automationId} onChange={(e) => setAutomationId(e.target.value)}>
                <option value="">Choose an automation…</option>
                {accountAutomations.map((automation) => (
                  <option key={automation.id} value={automation.id}>
                    {automation.name}
                  </option>
                ))}
              </Select>
            </Field>

            {accountAutomations.length === 0 && (
              <p className="text-[12.5px] text-[var(--text-muted)]">
                This account has no automations yet.{" "}
                <Link href="/dashboard/automations/new" className="text-[var(--accent)] underline">
                  Build one first
                </Link>
                .
              </p>
            )}

            <Field label="How should it attach?">
              <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="DRAFT_CODE">Draft code: I&apos;ll put a code in the caption</option>
                <option value="NEXT_POST">Next post: attach to whatever I publish next</option>
              </Select>
            </Field>

            <Field label="Name this plan">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Friday drop Reel"
              />
            </Field>

            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={create} loading={saving}>
                Create plan and get my code
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {planned.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Nothing planned yet"
          description="Plan an automation and you'll get a draft code to drop into your next caption."
        />
      ) : (
        <div className="space-y-3">
          {planned.map((plan) => (
            <article
              key={plan.id}
              className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold">{plan.name}</p>
                    <StatusBadge status={plan.status} />
                  </div>
                  <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
                    @{plan.accountUsername}
                    {plan.automationName && (
                      <>
                        {" · "}
                        <Link
                          href={`/dashboard/automations/${plan.automationId}`}
                          className="hover:text-[var(--accent)]"
                        >
                          {plan.automationName}
                        </Link>
                      </>
                    )}
                    {" · "}
                    {plan.matchedAt
                      ? `matched ${timeAgo(plan.matchedAt)}`
                      : `created ${timeAgo(plan.createdAt)}`}
                  </p>

                  {plan.status === "waiting" &&
                    (plan.mode === "NEXT_POST" ? (
                      <p className="mt-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] font-medium text-[var(--text-muted)]">
                        Waiting for your next post, nothing to paste. It attaches
                        automatically the moment you publish.
                      </p>
                    ) : (
                      <div className="mt-3 max-w-xs">
                        <CopyField label="Paste this in your caption" value={plan.draftCode} />
                      </div>
                    ))}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove plan"
                  onClick={() => remove(plan.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "success" | "brand" | "neutral"; label: string }> = {
    waiting: { tone: "brand", label: "Waiting for the post" },
    matched: { tone: "success", label: "Live" },
    expired: { tone: "neutral", label: "Expired" },
    cancelled: { tone: "neutral", label: "Cancelled" },
  };
  const config = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
