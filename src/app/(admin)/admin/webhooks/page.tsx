import Link from "next/link";
import { AlertTriangle, Inbox } from "lucide-react";
import { listWebhookEvents, webhookSummary } from "@/lib/admin-queries";
import { formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATES = [
  { key: "all", label: "All" },
  { key: "unmatched", label: "Unmatched" },
  { key: "failed", label: "Failed" },
  { key: "unprocessed", label: "Unprocessed" },
];

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

export default async function AdminWebhooks({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; accountId?: string; field?: string; state?: string }>;
}) {
  const sp = await searchParams;
  const filter = {
    workspaceId: sp.workspaceId,
    accountId: sp.accountId,
    field: sp.field,
    state: sp.state ?? "all",
  };

  const [events, summary] = await Promise.all([
    listWebhookEvents({ ...filter, limit: 200 }),
    webhookSummary(filter),
  ]);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v);
    return `/admin/webhooks${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-extrabold">Webhook deliveries</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] font-semibold text-[var(--text-muted)]">
          Everything Instagram has sent us, newest first. Payloads are kept for 30 days
          and then purged, which is what the privacy policy promises. Reading one is
          logged.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total stored" value={formatNumber(summary.total)} />
        <Stat label="Last 24h" value={formatNumber(summary.last24h)} />
        <Stat label="Unmatched" value={formatNumber(summary.unmatched)} warn />
        <Stat label="Failed" value={formatNumber(summary.failed)} warn />
        <Stat label="Unprocessed" value={formatNumber(summary.unprocessed)} warn />
      </section>

      {summary.total === 0 && (
        <p className="flex items-start gap-2.5 rounded-[var(--radius-card)] border-2 border-[var(--color-zap-500)] bg-[var(--bg-raised)] p-4 text-[13px] font-semibold leading-relaxed text-[var(--text-muted)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-zap-500)]" />
          <span>
            Nothing has ever arrived. That points at the app-level webhook config rather
            than at any one account: check the callback URL is verified under{" "}
            <em>Instagram → API setup with Instagram login → Configure webhooks</em>, and
            that the fields are enabled there.
          </span>
        </p>
      )}

      {summary.unmatched > 0 && (
        <p className="flex items-start gap-2.5 rounded-[var(--radius-card)] border-2 border-[var(--color-zonk-500)] bg-[var(--bg-raised)] p-4 text-[13px] font-semibold leading-relaxed text-[var(--text-muted)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-zonk-500)]" />
          <span>
            {formatNumber(summary.unmatched)} delivery
            {summary.unmatched === 1 ? "" : "ies"} matched no connected account. Instagram
            got a 200 and considers these delivered, but nothing ran. Usually the stored
            account ID differs from the one in <span className="font-mono">entry.id</span>.
            Reconnecting the account rewrites it.
          </span>
        </p>
      )}

      <section className="flex flex-wrap items-center gap-2">
        {STATES.map((s) => (
          <Link
            key={s.key}
            href={qs({ state: s.key === "all" ? undefined : s.key })}
            className={`rounded-lg border-2 px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
              (sp.state ?? "all") === s.key
                ? "border-[var(--border)] bg-[var(--bg-sunken)]"
                : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--border)]"
            }`}
          >
            {s.label}
          </Link>
        ))}
        <span className="mx-1 text-[var(--text-faint)]">·</span>
        <Link
          href={qs({ field: undefined })}
          className={`rounded-lg border-2 px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
            !sp.field
              ? "border-[var(--border)] bg-[var(--bg-sunken)]"
              : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--border)]"
          }`}
        >
          Every field
        </Link>
        {summary.byField.map((f) => (
          <Link
            key={f.field}
            href={qs({ field: f.field })}
            className={`rounded-lg border-2 px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
              sp.field === f.field
                ? "border-[var(--border)] bg-[var(--bg-sunken)]"
                : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--border)]"
            }`}
          >
            {f.field}{" "}
            <span className="font-normal text-[var(--text-faint)]">{formatNumber(f.count)}</span>
          </Link>
        ))}
      </section>

      {events.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--border-soft)] p-10 text-[13px] font-semibold text-[var(--text-faint)]">
          <Inbox className="h-4 w-4" />
          Nothing matches this filter.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border-2 border-[var(--border-soft)]">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--bg-sunken)] text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
              <tr>
                <th className="px-3 py-2 text-left font-bold">When</th>
                <th className="px-3 py-2 text-left font-bold">Field</th>
                <th className="px-3 py-2 text-left font-bold">Account</th>
                <th className="px-3 py-2 text-left font-bold">Customer</th>
                <th className="px-3 py-2 text-left font-bold">State</th>
                <th className="px-3 py-2 text-right font-bold">Payload</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-[var(--border-soft)]">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--text-muted)]">
                    {timeAgo(e.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px]">{e.field}</td>
                  <td className="px-3 py-2 font-bold">
                    {e.username ? `@${e.username}` : <span className="text-[var(--color-zonk-500)]">unmatched</span>}
                  </td>
                  <td className="px-3 py-2">
                    {e.workspaceId ? (
                      <Link
                        href={`/admin/customers/${e.workspaceId}`}
                        className="font-semibold underline underline-offset-2"
                      >
                        {e.workspaceName}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-faint)]">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {e.error ? (
                      <span className="font-semibold text-[var(--color-zonk-500)]">{e.error.slice(0, 60)}</span>
                    ) : e.processed ? (
                      <span className="font-semibold text-[var(--color-boom-500)]">processed</span>
                    ) : (
                      <span className="font-semibold text-[var(--color-zap-500)]">queued</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/webhooks/${e.id}`}
                      className="font-semibold underline underline-offset-2"
                    >
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
