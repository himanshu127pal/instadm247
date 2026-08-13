"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Megaphone, Plus, RefreshCw, Send, Users } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { timeAgo } from "@/lib/utils";

type Broadcast = {
  id: string;
  name: string;
  kind: string;
  status: string;
  accountUsername: string;
  segmentName: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  recurring: boolean;
  reengageAfterHours: number | null;
  createdAt: string;
};

export function BroadcastsView({
  accounts,
  segments,
  broadcasts,
  reachableCount,
}: {
  accounts: Array<{ id: string; username: string }>;
  segments: Array<{ id: string; name: string }>;
  broadcasts: Broadcast[];
  reachableCount: number;
}) {
  const [composing, setComposing] = React.useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold">
              {reachableCount.toLocaleString()} people reachable right now
            </p>
            <p className="mt-0.5 max-w-lg text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              Instagram only lets you message someone within 24 hours of them
              contacting you. That&rsquo;s who this counts — and it changes minute
              to minute.
            </p>
          </div>
        </div>
        {accounts.length > 0 && (
          <Button variant="gradient" onClick={() => setComposing((v) => !v)}>
            <Plus className="h-4 w-4" />
            New broadcast
          </Button>
        )}
      </div>

      {composing && accounts.length > 0 && (
        <Composer
          accounts={accounts}
          segments={segments}
          onDone={() => setComposing(false)}
        />
      )}

      {broadcasts.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="No broadcasts yet"
          description="Send a one-off message to your active contacts, or set up a recurring nudge for people who've gone quiet."
        />
      ) : (
        <div className="space-y-3">
          {broadcasts.map((broadcast) => (
            <article
              key={broadcast.id}
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold">{broadcast.name}</p>
                    <StatusBadge status={broadcast.status} />
                    {broadcast.kind === "REENGAGE" && (
                      <Badge tone="info">
                        <RefreshCw className="h-3 w-3" />
                        Re-engage
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
                    @{broadcast.accountUsername}
                    {broadcast.segmentName && ` · ${broadcast.segmentName}`}
                    {broadcast.recurring &&
                      broadcast.reengageAfterHours &&
                      ` · every ${broadcast.reengageAfterHours}h`}
                    {" · "}
                    {broadcast.completedAt
                      ? `finished ${timeAgo(broadcast.completedAt)}`
                      : broadcast.scheduledAt
                        ? `scheduled ${new Date(broadcast.scheduledAt).toLocaleString()}`
                        : `created ${timeAgo(broadcast.createdAt)}`}
                  </p>
                </div>

                <dl className="flex gap-5">
                  {[
                    { label: "Sent", value: broadcast.sentCount },
                    { label: "Skipped", value: broadcast.skippedCount },
                    { label: "Failed", value: broadcast.failedCount },
                  ].map((metric) => (
                    <div key={metric.label} className="text-right">
                      <dt className="text-[10.5px] uppercase tracking-wider text-[var(--text-faint)]">
                        {metric.label}
                      </dt>
                      <dd className="text-[16px] font-semibold tabular-nums">
                        {metric.value.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "success" | "brand" | "warning" | "neutral"; label: string }> = {
    sent: { tone: "success", label: "Sent" },
    sending: { tone: "brand", label: "Sending" },
    scheduled: { tone: "brand", label: "Scheduled" },
    draft: { tone: "neutral", label: "Draft" },
    failed: { tone: "warning", label: "Failed" },
    cancelled: { tone: "neutral", label: "Cancelled" },
  };
  const config = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function Composer({
  accounts,
  segments,
  onDone,
}: {
  accounts: Array<{ id: string; username: string }>;
  segments: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = React.useState(accounts[0].id);
  const [name, setName] = React.useState("");
  const [text, setText] = React.useState("");
  const [kind, setKind] = React.useState<"BROADCAST" | "REENGAGE">("BROADCAST");
  const [tags, setTags] = React.useState("");
  const [reengageAfterHours, setReengageAfterHours] = React.useState(12);
  const [recurring, setRecurring] = React.useState(false);
  const [segmentId, setSegmentId] = React.useState("");
  const [audience, setAudience] = React.useState<{ total: number; eligible: number } | null>(null);
  const [sending, setSending] = React.useState(false);

  const filter = React.useMemo(
    () => ({
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    }),
    [tags],
  );

  // Preview the audience as the targeting changes, so the number is never a surprise.
  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/broadcasts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, filter }),
        });
        const data = (await res.json()) as { audience?: { total: number; eligible: number } };
        if (!cancelled && data.audience) setAudience(data.audience);
      } catch {
        if (!cancelled) setAudience(null);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accountId, filter]);

  async function submit(sendNow: boolean) {
    if (!text.trim()) {
      toast.error("Write the message first.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          name: name.trim() || (kind === "REENGAGE" ? "Re-engagement" : "Broadcast"),
          kind,
          payload: { kind: "text", text },
          segmentId: segmentId || null,
          filter,
          reengageAfterHours: kind === "REENGAGE" ? reengageAfterHours : undefined,
          recurring: kind === "REENGAGE" ? recurring : false,
          sendNow,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create the broadcast");

      toast.success(sendNow ? "Broadcast started" : "Saved as a draft");
      onDone();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <SectionCard title="New broadcast">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="BROADCAST">One-off broadcast</option>
              <option value="REENGAGE">Smart re-engagement</option>
            </Select>
          </Field>

          {accounts.length > 1 && (
            <Field label="From account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <Field label="Name" hint="Just for your records.">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "REENGAGE" ? "Quiet contacts nudge" : "Friday drop announcement"}
          />
        </Field>

        <Field label="Message" hint="Supports {{first_name}} and your other tokens.">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hey {{first_name}} — the new drop is live and the code from earlier still works 👀"
            maxLength={1000}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Only contacts tagged" hint="Comma separated. Leave blank for everyone.">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lead, vip" />
          </Field>

          {segments.length > 0 && (
            <Field label="Or use a saved segment">
              <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                <option value="">None</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {kind === "REENGAGE" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nudge after (hours)"
              hint="Skips anyone you've messaged more recently than this."
            >
              <Input
                type="number"
                min={1}
                max={168}
                value={reengageAfterHours}
                onChange={(e) => setReengageAfterHours(Number(e.target.value) || 12)}
              />
            </Field>
            <label className="flex items-center gap-3 self-end rounded-xl border border-[var(--border)] p-3">
              <Switch checked={recurring} onCheckedChange={setRecurring} label="Repeat" />
              <span className="text-[13px]">Keep running on this schedule</span>
            </label>
          </div>
        )}

        {audience && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-3.5">
            <p className="text-[13px]">
              <span className="font-semibold">{audience.eligible.toLocaleString()}</span> of{" "}
              {audience.total.toLocaleString()} matching contacts can receive this right now.
            </p>
            {audience.total > audience.eligible && (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
                The other {(audience.total - audience.eligible).toLocaleString()} are outside
                Instagram&rsquo;s 24-hour messaging window, so they&rsquo;ll be skipped rather
                than messaged.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="gradient" loading={sending} onClick={() => submit(true)}>
            <Send className="h-4 w-4" />
            {kind === "REENGAGE" ? "Start campaign" : "Send now"}
          </Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={sending}>
            Save as draft
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={sending}>
            Cancel
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
