import Link from "next/link";
import { AlertTriangle, Inbox } from "lucide-react";
import { billingSummary, listPaymentEvents } from "@/lib/admin-queries";
import { env, isBillingConfigured } from "@/lib/env";
import { formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["processed", "failed", "unmatched", "rejected", "duplicate", "ignored", "ok"];

const TONE: Record<string, string> = {
  processed: "text-[var(--color-boom-500)]",
  ok: "text-[var(--color-boom-500)]",
  failed: "text-[var(--color-zonk-500)]",
  rejected: "text-[var(--color-zonk-500)]",
  unmatched: "text-[var(--color-zap-500)]",
  received: "text-[var(--color-zap-500)]",
};

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
      <p
        className={`mt-1 text-[21px] font-extrabold leading-none ${
          warn && value !== "0" ? "text-[var(--color-zonk-500)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function money(minor: number | null, currency: string | null) {
  if (minor == null) return "";
  return `${(minor / 100).toFixed(2)} ${currency ?? ""}`.trim();
}

export default async function AdminBilling({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; status?: string; direction?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const [events, summary] = await Promise.all([
    listPaymentEvents({ ...sp, limit: 200 }),
    billingSummary(),
  ]);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v);
    return `/admin/billing${p.toString() ? `?${p}` : ""}`;
  };
  const chip = (active: boolean) =>
    `rounded-lg border-2 px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
      active
        ? "border-[var(--border)] bg-[var(--bg-sunken)]"
        : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--border)]"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-extrabold">Billing</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] font-semibold text-[var(--text-muted)]">
          Every webhook Dodo sent us — signed or not — and every call we made to Dodo, newest
          first. Nothing that reaches the endpoint goes unrecorded.
        </p>
      </div>

      {(!env.billing.enabled || !isBillingConfigured()) && (
        <p className="flex items-start gap-2.5 rounded-[var(--radius-card)] border-2 border-[var(--color-zap-500)] bg-[var(--bg-raised)] p-3 text-[13px] font-semibold text-[var(--text-muted)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-zap-500)]" />
          <span>
            {!isBillingConfigured()
              ? "Dodo isn't configured, so no checkout can start. See docs/BILLING.md."
              : "BILLING_ENABLED is off: plans resolve and usage is counted, but nothing is enforced and only staff can check out."}
          </span>
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active subscriptions" value={formatNumber(summary.activeSubscriptions)} />
        <Stat label="MRR (list-price estimate)" value={`$${formatNumber(summary.mrrEstimate)}`} />
        <Stat label="Past due" value={formatNumber(summary.pastDue)} warn />
        <Stat label="Failed / unmatched, 7d" value={formatNumber(summary.needsAttention7d)} warn />
        <Stat label="Rejected, 24h" value={formatNumber(summary.last24h.rejected ?? 0)} warn />
        <Stat label="Processed, 24h" value={formatNumber(summary.last24h.processed ?? 0)} />
      </section>

      {Object.keys(summary.activeByPlan).length > 0 && (
        <p className="text-[12.5px] font-semibold text-[var(--text-muted)]">
          Active by plan:{" "}
          {Object.entries(summary.activeByPlan)
            .map(([plan, n]) => `${plan} ${n}`)
            .join(" · ")}
        </p>
      )}

      <section className="flex flex-wrap items-center gap-2">
        <Link href={qs({ status: undefined })} className={chip(!sp.status)}>
          Every status
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s })} className={chip(sp.status === s)}>
            {s}
          </Link>
        ))}
        <span className="mx-1 text-[var(--text-faint)]">·</span>
        <Link href={qs({ direction: undefined })} className={chip(!sp.direction)}>
          Both directions
        </Link>
        <Link href={qs({ direction: "inbound" })} className={chip(sp.direction === "inbound")}>
          From Dodo
        </Link>
        <Link href={qs({ direction: "outbound" })} className={chip(sp.direction === "outbound")}>
          To Dodo
        </Link>
        {sp.workspaceId && (
          <Link href={qs({ workspaceId: undefined })} className={chip(true)}>
            One customer ✕
          </Link>
        )}
      </section>

      {events.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--border-soft)] p-10 text-[13px] font-semibold text-[var(--text-faint)]">
          <Inbox className="h-4 w-4" />
          Nothing matches this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-[var(--border-soft)]">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--bg-sunken)] text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
              <tr>
                <th className="px-3 py-2 text-left font-bold">When</th>
                <th className="px-3 py-2 text-left font-bold">Dir</th>
                <th className="px-3 py-2 text-left font-bold">Event</th>
                <th className="px-3 py-2 text-left font-bold">Customer</th>
                <th className="px-3 py-2 text-left font-bold">Amount</th>
                <th className="px-3 py-2 text-left font-bold">Outcome</th>
                <th className="px-3 py-2 text-right font-bold" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-[var(--border-soft)] align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--text-muted)]">{timeAgo(e.receivedAt)}</td>
                  <td className="px-3 py-2 text-[var(--text-faint)]">{e.direction === "inbound" ? "in" : "out"}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{e.type ?? "—"}</td>
                  <td className="px-3 py-2">
                    {e.workspace ? (
                      <Link href={`/admin/customers/${e.workspace.id}`} className="font-semibold underline underline-offset-2">
                        {e.workspace.name}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{money(e.amount, e.currency)}</td>
                  <td className="px-3 py-2">
                    <span className={`font-bold ${TONE[e.status] ?? ""}`}>{e.status}</span>
                    {(e.error || e.note) && (
                      <span className="block max-w-md text-[12px] font-semibold text-[var(--text-muted)]">
                        {(e.error ?? e.note)!.slice(0, 140)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/billing/${e.id}`} className="font-semibold underline underline-offset-2">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
