import Link from "next/link";
import { listCustomers } from "@/lib/admin-queries";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q, filter } = await searchParams;
  const all = await listCustomers({ query: q });
  const rows =
    filter === "attention"
      ? all.filter((r) => r.accountsNeedingAttention > 0 || r.suspendedAt)
      : all;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold">Customers</h1>
          <p className="mt-1 text-[13.5px] font-semibold text-[var(--text-muted)]">
            {rows.length} {rows.length === 1 ? "workspace" : "workspaces"}
            {filter === "attention" && " needing attention"}
          </p>
        </div>
        <form className="flex items-center gap-2" action="/admin/customers">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, email or @username"
            className="w-72 rounded-lg border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-1.5 text-[13.5px] font-semibold outline-none focus:border-[var(--border)]"
          />
          <button
            type="submit"
            className="rounded-lg border-2 border-[var(--border-soft)] px-3 py-1.5 text-[13.5px] font-bold hover:border-[var(--border)]"
          >
            Search
          </button>
          {(q || filter) && (
            <Link href="/admin/customers" className="text-[13px] font-semibold underline underline-offset-2">
              Clear
            </Link>
          )}
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border-2 border-dashed border-[var(--border-soft)] p-10 text-center text-[13.5px] font-semibold text-[var(--text-faint)]">
          No customers match.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-[var(--border-soft)]">
          <table className="w-full min-w-[900px] text-[13.5px]">
            <thead className="bg-[var(--bg-sunken)] text-[11.5px] uppercase tracking-wider text-[var(--text-faint)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold">Customer</th>
                <th className="px-4 py-2.5 text-left font-bold">Owner</th>
                <th className="px-4 py-2.5 text-left font-bold">Plan</th>
                <th className="px-4 py-2.5 text-right font-bold">IG</th>
                <th className="px-4 py-2.5 text-right font-bold">Contacts</th>
                <th className="px-4 py-2.5 text-right font-bold">Sent 30d</th>
                <th className="px-4 py-2.5 text-left font-bold">Joined</th>
                <th className="px-4 py-2.5 text-left font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border-soft)] hover:bg-[var(--bg-sunken)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/customers/${r.id}`} className="font-extrabold underline underline-offset-2">
                      {r.name}
                    </Link>
                    <span className="ml-2 text-[12px] font-semibold text-[var(--text-faint)]">/{r.slug}</span>
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-[var(--text-muted)]">{r.ownerEmail ?? "—"}</td>
                  <td className="px-4 py-2.5 font-semibold">{r.planKey}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                    {r.accountCount}
                    {r.accountsNeedingAttention > 0 && (
                      <span
                        className="ml-1.5 text-[var(--color-zonk-500)]"
                        title={`${r.accountsNeedingAttention} need attention`}
                      >
                        ●
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.contactCount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.sent30d)}</td>
                  <td className="px-4 py-2.5 font-semibold text-[var(--text-faint)]">
                    {r.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.suspendedAt ? (
                      <span className="rounded-full bg-[var(--color-zap-400)] px-2 py-0.5 text-[11.5px] font-extrabold text-[#12110e]">
                        Suspended
                      </span>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-[var(--text-faint)]">Active</span>
                    )}
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
