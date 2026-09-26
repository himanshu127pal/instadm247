"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Gauge, ShieldOff, TimerReset } from "lucide-react";
import { Badge, Button, Switch } from "@/components/ui";
import { SectionCard, StatCard } from "@/components/dashboard/bits";
import { SkipReasonChart } from "@/components/dashboard/charts";
import { cn, timeAgo } from "@/lib/utils";

type Account = {
  id: string;
  username: string;
  status: string;
  automationPaused: boolean;
  pausedReason: string | null;
  slowDownUntil: string | null;
  tokenExpiresAt: string | null;
  viralProtection: boolean;
  viralThresholdPerMin: number;
};

export function SafetyView({
  accounts,
  limits,
  skips,
  failures,
  suppressions,
  policyEvents,
}: {
  accounts: Account[];
  limits: Array<{
    accountId: string;
    username: string;
    classes: Array<{ rateClass: string; used: number; cap: number; unknown: boolean }>;
    inboundRate: number | null;
  }>;
  skips: Array<{ reason: string; count: number; label: string; explanation: string }>;
  failures: Array<{ id: string; username: string | null; reason: string | null; createdAt: string }>;
  suppressions: number;
  policyEvents: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  const totalSkips = skips.reduce((sum, s) => sum + s.count, 0);

  async function update(accountId: string, body: Record<string, boolean>) {
    setBusy(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Could not update this account");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Messages skipped"
          value={totalSkips}
          hint="last 7 days"
          icon={<ShieldOff />}
          tone={totalSkips > 0 ? "warning" : "neutral"}
        />
        <StatCard label="Suppressed contacts" value={suppressions} hint="opt-outs and blocks" />
        {policyEvents > 0 && (
          <StatCard
            label="Policy notices"
            value={policyEvents}
            hint="last 30 days"
            tone="warning"
          />
        )}
      </div>

      <SectionCard
        title="Accounts"
        description="Pause automation or switch on Slow Down mode by hand whenever you want to be careful."
      >
        {accounts.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">No accounts connected yet.</p>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const slowedDown = Boolean(
                account.slowDownUntil && new Date(account.slowDownUntil) > new Date(),
              );
              const accountLimits = limits.find((l) => l.accountId === account.id);

              return (
                <div
                  key={account.id}
                  className="rounded-xl border-2 border-[var(--border)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-medium">@{account.username}</p>
                      {account.pausedReason && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--color-zonk-500)]">
                          <AlertTriangle className="h-3 w-3" />
                          {account.pausedReason}
                        </p>
                      )}
                      {account.tokenExpiresAt && (
                        <p className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">
                          Instagram access renews automatically · expires{" "}
                          {new Date(account.tokenExpiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2">
                        <Switch
                          checked={!account.automationPaused}
                          onCheckedChange={(v) =>
                            update(account.id, { automationPaused: !v })
                          }
                          disabled={busy === account.id}
                          label="Automations enabled"
                        />
                        <span className="text-[12.5px] text-[var(--text-muted)]">
                          Automations {account.automationPaused ? "paused" : "running"}
                        </span>
                      </label>

                      <label className="flex items-center gap-2">
                        <Switch
                          checked={slowedDown}
                          onCheckedChange={(v) => update(account.id, { slowDown: v })}
                          disabled={busy === account.id}
                          label="Slow Down mode"
                        />
                        <span className="text-[12.5px] text-[var(--text-muted)]">
                          Slow Down mode
                        </span>
                      </label>

                      <label className="flex items-center gap-2">
                        <Switch
                          checked={account.viralProtection}
                          onCheckedChange={(v) =>
                            update(account.id, { viralProtection: v })
                          }
                          disabled={busy === account.id}
                          label="Viral post protection"
                        />
                        <span className="text-[12.5px] text-[var(--text-muted)]">
                          Viral protection
                        </span>
                      </label>
                    </div>
                  </div>

                  {slowedDown && (
                    <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-[var(--color-zonk-500)]">
                      <TimerReset className="h-3.5 w-3.5" />
                      Sending is halved until{" "}
                      {new Date(account.slowDownUntil!).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      , then it returns to normal by itself.
                    </p>
                  )}

                  {account.viralProtection && (
                    <p className="mt-2.5 text-[12px] font-medium text-[var(--text-muted)]">
                      Slows down automatically above{" "}
                      <strong className="text-[var(--text)]">
                        {account.viralThresholdPerMin}
                      </strong>{" "}
                      interactions a minute
                      {typeof accountLimits?.inboundRate === "number" && (
                        <>
                          {" "}
                          · currently{" "}
                          <strong
                            className={
                              accountLimits.inboundRate >= account.viralThresholdPerMin
                                ? "text-[var(--color-zap-500)]"
                                : "text-[var(--text)]"
                            }
                          >
                            {accountLimits.inboundRate}/min
                          </strong>
                        </>
                      )}
                    </p>
                  )}

                  {accountLimits && (
                    <div className="mt-3 grid gap-2.5 border-t-2 border-[var(--border-soft)] pt-3 sm:grid-cols-2">
                      {accountLimits.classes.map((rate) => {
                        const pct = rate.cap > 0 ? Math.min(100, (rate.used / rate.cap) * 100) : 0;
                        return (
                          <div key={rate.rateClass}>
                            <div className="mb-1 flex items-baseline justify-between text-[11.5px]">
                              <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                                <Gauge className="h-3 w-3" />
                                {rate.rateClass === "private_reply"
                                  ? "Private replies this hour"
                                  : "DMs this hour"}
                              </span>
                              <span className="tabular-nums text-[var(--text-faint)]">
                                {rate.unknown ? "Unknown" : `${rate.used} / ${rate.cap}`}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  pct > 85 ? "bg-[var(--color-pow-400)]" : "bg-[var(--color-boom-400)]",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Why messages weren't sent"
          description="Last 7 days. Skips are the system working, not failing."
        >
          <SkipReasonChart data={skips} />

          {skips.length > 0 && (
            <ul className="mt-4 space-y-2 border-t-2 border-[var(--border-soft)] pt-4">
              {skips.map((skip) => (
                <li key={skip.reason} className="text-[12.5px]">
                  <span className="font-medium">{skip.label}</span>
                  <span className="text-[var(--text-faint)]"> · {skip.count.toLocaleString()}</span>
                  <p className="mt-0.5 leading-relaxed text-[var(--text-muted)]">
                    {skip.explanation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent failures" description="Errors Instagram returned.">
          {failures.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">
              No failed sends in the last 7 days.
            </p>
          ) : (
            <ul className="divide-y-2 divide-[var(--border-soft)]">
              {failures.map((failure) => (
                <li key={failure.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium">
                      @{failure.username ?? "unknown"}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                      {timeAgo(failure.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-zap-500)]">
                    {failure.reason ?? "Unknown error"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="The rules we enforce for you">
        <ul className="space-y-3">
          {[
            [
              "24-hour messaging window",
              "You can message someone for 24 hours after they contact you. We track this per person and never attempt a send outside it.",
            ],
            [
              "One private reply per comment",
              "Instagram allows exactly one. Each comment is claimed atomically, so duplicate webhooks (which Meta warns about on boosted posts) can't produce a second DM.",
            ],
            [
              "7-day private reply deadline",
              "Comments on posts and Reels can be replied to privately for 7 days. Live comments only during the broadcast.",
            ],
            [
              "Conservative rate limits",
              "We pace well under Meta's published ceilings, per account. Repeated throttling automatically arms Slow Down mode for 2 hours.",
            ],
            [
              "The HUMAN_AGENT tag, used honestly",
              "It extends replies to 7 days and is only ever attached to messages you type yourself in the inbox. Never to automation, because Meta detects that.",
            ],
            [
              "Viral post protection",
              "When a post takes off, we slow down before Instagram has a reason to throttle you, not after.",
            ],
            [
              "Opt-outs honoured everywhere",
              "Anyone replying STOP is suppressed instantly across every automation on that account.",
            ],
          ].map(([title, body]) => (
            <li key={title} className="flex items-start gap-2.5">
              <Badge tone="success" className="mt-0.5 shrink-0">
                ✓
              </Badge>
              <span>
                <span className="block text-[13.5px] font-medium">{title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

export { Button };
