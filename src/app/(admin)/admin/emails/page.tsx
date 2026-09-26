import Link from "next/link";
import { AlertTriangle, Inbox } from "lucide-react";
import { emailSummary, listEmails } from "@/lib/admin-queries";
import { env, isEmailConfigured } from "@/lib/env";
import { EmailRetryButton } from "@/components/admin/email-retry";
import { formatNumber, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["sent", "queued", "failed", "skipped"];
const CATEGORIES = ["accounts", "billing", "alerts"];

const TONE: Record<string, string> = {
  sent: "text-[var(--color-boom-500)]",
  failed: "text-[var(--color-zonk-500)]",
  queued: "text-[var(--color-zap-500)]",
  skipped: "text-[var(--text-faint)]",
};

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
      <p className={`mt-1 text-[21px] font-extrabold leading-none ${warn && value > 0 ? "text-[var(--color-zonk-500)]" : ""}`}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

export default async function AdminEmails({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; status?: string; category?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const [emails, summary] = await Promise.all([listEmails({ ...sp, limit: 200 }), emailSummary()]);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v);
    return `/admin/emails${p.toString() ? `?${p}` : ""}`;
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
        <h1 className="text-[24px] font-extrabold">Emails</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] font-semibold text-[var(--text-muted)]">
          Every email the platform sent or tried to, newest first. Verification and password-reset
          emails show here too, but their links are never stored.
        </p>
      </div>

      {!isEmailConfigured() && (
        <p className="flex items-start gap-2.5 rounded-[var(--radius-card)] border-2 border-[var(--color-zap-500)] bg-[var(--bg-raised)] p-3 text-[13px] font-semibold text-[var(--text-muted)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-zap-500)]" />
          <span>
            {env.email.provider === "ses"
              ? "EMAIL_PROVIDER is ses but SES_REGION is missing, so nothing is sent."
              : "Email isn't configured (EMAIL_PROVIDER), so every email is recorded as skipped. See docs/EMAIL.md."}
          </span>
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Sent, 24h" value={summary.last24h.sent ?? 0} />
        <Stat label="Queued, 24h" value={summary.last24h.queued ?? 0} />
        <Stat label="Failed, 24h" value={summary.last24h.failed ?? 0} warn />
        <Stat label="Failed, 7d" value={summary.failed7d} warn />
        <Stat label="Skipped, 24h" value={summary.last24h.skipped ?? 0} />
      </section>

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
        <Link href={qs({ category: undefined })} className={chip(!sp.category)}>
          Every sender
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={qs({ category: c })} className={chip(sp.category === c)}>
            {c}
          </Link>
        ))}
        {sp.workspaceId && (
          <Link href={qs({ workspaceId: undefined })} className={chip(true)}>
            One customer ✕
          </Link>
        )}
        {sp.to && (
          <Link href={qs({ to: undefined })} className={chip(true)}>
            {sp.to} ✕
          </Link>
        )}
        <form action="/admin/emails" className="ml-auto flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
          <input
            name="to"
            type="email"
            defaultValue={sp.to}
            placeholder="Recipient address"
            className="rounded-lg border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-1.5 text-[12.5px] font-semibold"
          />
        </form>
      </section>

      {emails.length === 0 ? (
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
                <th className="px-3 py-2 text-left font-bold">To</th>
                <th className="px-3 py-2 text-left font-bold">Email</th>
                <th className="px-3 py-2 text-left font-bold">Customer</th>
                <th className="px-3 py-2 text-left font-bold">Outcome</th>
                <th className="px-3 py-2 text-right font-bold" />
              </tr>
            </thead>
            <tbody>
              {emails.map((e) => (
                <tr key={e.id} className="border-t border-[var(--border-soft)] align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--text-muted)]" title={e.createdAt.toISOString()}>
                    {timeAgo(e.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={qs({ to: e.to })} className="font-semibold underline underline-offset-2">
                      {e.to}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-semibold">{e.subject}</span>
                    <span className="font-mono text-[11.5px] text-[var(--text-faint)]">
                      {e.category} · {e.template}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {e.workspaceId ? (
                      <Link href={`/admin/customers/${e.workspaceId}`} className="font-semibold underline underline-offset-2">
                        {e.workspaceName ?? e.workspaceId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-faint)]">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-bold ${TONE[e.status] ?? ""}`}>{e.status}</span>
                    {e.attempts > 1 && (
                      <span className="text-[12px] font-semibold text-[var(--text-faint)]"> · {e.attempts} tries</span>
                    )}
                    {e.error && (
                      <span className="block max-w-md text-[12px] font-semibold text-[var(--text-muted)]">
                        {e.error.slice(0, 160)}
                      </span>
                    )}
                    {e.providerMessageId && (
                      <span className="block font-mono text-[11px] text-[var(--text-faint)]" title="SES message ID">
                        {e.providerMessageId}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{e.retryable && <EmailRetryButton id={e.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
