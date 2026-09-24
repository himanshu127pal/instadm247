import Link from "next/link";
import type { customerBilling } from "@/lib/admin-queries";
import { PlanOverrideControl, SubscriptionActions } from "./billing-controls";
import { formatNumber, timeAgo } from "@/lib/utils";

type Data = NonNullable<Awaited<ReturnType<typeof customerBilling>>>;

function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const finite = Number.isFinite(cap);
  const pct = finite && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const over = finite && used > cap;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px] font-bold">
        <span>{label}</span>
        <span className={`tabular-nums ${over ? "text-[var(--color-zonk-500)]" : "text-[var(--text-muted)]"}`}>
          {formatNumber(used)} / {finite ? formatNumber(cap) : "∞"}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
        <div
          className={`h-full ${over || pct >= 100 ? "bg-[var(--color-zonk-500)]" : pct >= 80 ? "bg-[var(--color-zap-500)]" : "bg-[var(--color-boom-500)]"}`}
          style={{ width: `${finite ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

function d(v: Date | null | undefined) {
  return v ? v.toISOString().slice(0, 10) : "—";
}

export function CustomerBilling({
  workspaceId,
  data,
  role,
  billingEnabled,
}: {
  workspaceId: string;
  data: Data;
  role: "admin" | "support";
  billingEnabled: boolean;
}) {
  const isAdmin = role === "admin";

  return (
    <section className="space-y-4 rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-extrabold">Billing</h2>
        <Link
          href={`/admin/billing?workspaceId=${workspaceId}`}
          className="text-[12.5px] font-bold underline underline-offset-2"
        >
          Full payment trace →
        </Link>
      </div>

      {!billingEnabled && (
        <p className="text-[12.5px] font-semibold text-[var(--text-muted)]">
          Billing is off, so this customer is currently treated as unlimited. Below is what
          applies the moment it&rsquo;s switched on.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 font-bold text-[var(--text-faint)]">Plan</dt>
              <dd className="font-extrabold uppercase">{data.planKey}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 font-bold text-[var(--text-faint)]">Override</dt>
              <dd className="font-semibold">
                {data.planOverride ? (
                  <>
                    <strong className="uppercase">{data.planOverride}</strong>
                    {data.planOverrideUntil ? ` until ${d(data.planOverrideUntil)}` : " with no end date"}
                    <span className="block text-[12px] text-[var(--text-muted)]">
                      “{data.planOverrideReason ?? "no reason"}”
                      {data.overrideByEmail ? ` — ${data.overrideByEmail}` : ""}
                    </span>
                  </>
                ) : (
                  "none"
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-36 shrink-0 font-bold text-[var(--text-faint)]">Dodo customer</dt>
              <dd className="break-all font-mono text-[12px]">{data.billingCustomerId ?? "not created yet"}</dd>
            </div>
          </dl>
          <PlanOverrideControl workspaceId={workspaceId} hasOverride={Boolean(data.planOverride)} canManage={isAdmin} />
        </div>

        <div className="space-y-2.5">
          <p className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            This month (UTC)
          </p>
          <Meter label="Automated DMs" used={data.usage.dms} cap={data.limits.dmsPerMonth} />
          <Meter label="AI replies" used={data.usage.ai_replies} cap={data.limits.aiRepliesPerMonth} />
          <Meter label="Instagram accounts" used={data.accounts} cap={data.limits.instagramAccounts} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
          Subscriptions
        </p>
        {data.subscriptions.length === 0 ? (
          <p className="text-[13px] font-semibold text-[var(--text-faint)]">Never subscribed.</p>
        ) : (
          <ul className="space-y-3">
            {data.subscriptions.map((s) => (
              <li key={s.id} className="rounded-lg border-2 border-[var(--border-soft)] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13.5px] font-extrabold">
                    {s.planKey} / {s.interval} ·{" "}
                    <span
                      className={
                        s.status === "active"
                          ? "text-[var(--color-boom-500)]"
                          : s.status === "past_due"
                            ? "text-[var(--color-zap-500)]"
                            : "text-[var(--text-muted)]"
                      }
                    >
                      {s.status}
                    </span>
                    {s.cancelAtPeriodEnd && (
                      <span className="text-[var(--color-zap-500)]"> · cancels at period end</span>
                    )}
                  </p>
                  <p className="break-all font-mono text-[11.5px] text-[var(--text-faint)]">{s.providerSubscriptionId}</p>
                </div>
                <p className="mt-1 text-[12.5px] font-semibold text-[var(--text-muted)]">
                  Period {d(s.currentPeriodStart)} → {d(s.currentPeriodEnd)}
                  {s.graceEndsAt ? ` · dunning grace ends ${d(s.graceEndsAt)}` : ""}
                  {s.cancelledAt ? ` · cancelled ${d(s.cancelledAt)}` : ""}
                  {s.lastEventAt ? ` · last event ${timeAgo(s.lastEventAt)}` : ""}
                </p>
                <div className="mt-2">
                  <SubscriptionActions
                    workspaceId={workspaceId}
                    subscriptionId={s.providerSubscriptionId}
                    cancellable={["active", "past_due"].includes(s.status) && !s.cancelAtPeriodEnd}
                    canCancel={isAdmin}
                    refundable={s.interval === "year" && s.status === "active"}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
          Recent payment events
        </p>
        {data.events.length === 0 ? (
          <p className="text-[13px] font-semibold text-[var(--text-faint)]">None yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-soft)] text-[12.5px]">
            {data.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                <span className="w-20 shrink-0 text-[var(--text-faint)]">{timeAgo(e.receivedAt)}</span>
                <span className="w-8 shrink-0 text-[var(--text-faint)]">{e.direction === "inbound" ? "in" : "out"}</span>
                <Link href={`/admin/billing/${e.id}`} className="font-mono font-semibold underline underline-offset-2">
                  {e.type ?? "—"}
                </Link>
                <span className="font-bold">{e.status}</span>
                {(e.error || e.note) && (
                  <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-muted)]">
                    {e.error ?? e.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
