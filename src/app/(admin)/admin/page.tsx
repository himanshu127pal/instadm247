import Link from "next/link";
import { AlertTriangle, Ban, Building2, Send, Users } from "lucide-react";
import { platformOverview, sendingOutliers } from "@/lib/admin-queries";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "warn";
}) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
      <p className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
      <p
        className={`mt-1.5 text-[26px] font-extrabold leading-none ${
          tone === "warn" && value !== "0" ? "text-[var(--color-zap-500)]" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[12px] font-semibold text-[var(--text-faint)]">{hint}</p>}
    </div>
  );
}

export default async function AdminOverview() {
  const [o, outliers] = await Promise.all([platformOverview(), sendingOutliers(24)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[24px] font-extrabold">Overview</h1>
        <p className="mt-1 text-[13.5px] font-semibold text-[var(--text-muted)]">
          Everything below crosses customer boundaries. Access is logged.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={formatNumber(o.workspaces)} hint={`${o.newWorkspaces7d} new this week`} />
        <Stat label="Users" value={formatNumber(o.users)} />
        <Stat label="Instagram accounts" value={formatNumber(o.accounts)} />
        <Stat label="Suspended" value={formatNumber(o.suspended)} tone="warn" />
        <Stat label="Sent (24h)" value={formatNumber(o.sent24h)} />
        <Stat label="Failed (24h)" value={formatNumber(o.failed24h)} tone="warn" />
        <Stat
          label="Accounts needing attention"
          value={formatNumber(o.staleAccounts)}
          hint="Expired, revoked, or expiring within 7 days"
          tone="warn"
        />
        <Stat label="Automations paused" value={formatNumber(o.pausedAccounts)} tone="warn" />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-zonk-500)]" />
          <h2 className="text-[16px] font-extrabold">Highest volume, last 24 hours</h2>
        </div>
        <p className="mb-3 max-w-2xl text-[13px] font-semibold text-[var(--text-muted)]">
          Meta grades a Tech Provider&rsquo;s app as a whole. One account sending far
          above the norm can put every other customer&rsquo;s integration at risk, so
          this is worth a glance daily.
        </p>
        {outliers.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border-2 border-dashed border-[var(--border-soft)] p-6 text-center text-[13px] font-semibold text-[var(--text-faint)]">
            Nothing sent in the last 24 hours.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-card)] border-2 border-[var(--border-soft)]">
            <table className="w-full text-[13.5px]">
              <thead className="bg-[var(--bg-sunken)] text-[11.5px] uppercase tracking-wider text-[var(--text-faint)]">
                <tr>
                  <th className="px-4 py-2 text-left font-bold">Account</th>
                  <th className="px-4 py-2 text-left font-bold">Customer</th>
                  <th className="px-4 py-2 text-right font-bold">Sent</th>
                </tr>
              </thead>
              <tbody>
                {outliers.map((r) => (
                  <tr key={r.accountId} className="border-t border-[var(--border-soft)]">
                    <td className="px-4 py-2 font-bold">@{r.username}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/customers/${r.workspaceId}`}
                        className="font-semibold underline underline-offset-2"
                      >
                        {r.workspaceName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-extrabold tabular-nums">
                      {formatNumber(r.sent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/admin/customers", icon: Building2, label: "Customers", body: "Search, inspect, suspend, impersonate" },
          { href: "/admin/customers?filter=attention", icon: Send, label: "Needs attention", body: "Accounts to reconnect or unpause" },
          { href: "/admin/audit", icon: Users, label: "Audit log", body: "Every privileged action taken" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 transition-colors hover:border-[var(--border)]"
          >
            <c.icon className="h-5 w-5 text-[var(--text-muted)]" />
            <p className="mt-2 text-[14.5px] font-extrabold">{c.label}</p>
            <p className="mt-0.5 text-[12.5px] font-semibold text-[var(--text-faint)]">{c.body}</p>
          </Link>
        ))}
      </section>

      <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-faint)]">
        <Ban className="h-3.5 w-3.5" />
        Suspending a customer stops their automations sending, not just their sign-in.
      </p>
    </div>
  );
}
