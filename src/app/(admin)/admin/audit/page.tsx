import Link from "next/link";
import { recentAudit } from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  "impersonate.start": "text-[var(--color-zonk-500)]",
  "workspace.suspend": "text-[var(--color-zap-500)]",
};

export default async function AuditPage() {
  const rows = await recentAudit(200);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-extrabold">Audit log</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] font-semibold text-[var(--text-muted)]">
          Every privileged action, most recent first. Impersonation reaches messages
          written by people who never signed up here, so this record is what makes
          support access accountable. Treat it as append-only.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border-2 border-dashed border-[var(--border-soft)] p-10 text-center text-[13.5px] font-semibold text-[var(--text-faint)]">
          Nothing logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-[var(--border-soft)]">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="bg-[var(--bg-sunken)] text-[11.5px] uppercase tracking-wider text-[var(--text-faint)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold">When</th>
                <th className="px-4 py-2.5 text-left font-bold">Who</th>
                <th className="px-4 py-2.5 text-left font-bold">Action</th>
                <th className="px-4 py-2.5 text-left font-bold">Target</th>
                <th className="px-4 py-2.5 text-left font-bold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border-soft)]">
                  <td className="whitespace-nowrap px-4 py-2 font-semibold text-[var(--text-faint)]">
                    {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2 font-semibold">{r.actor.email}</td>
                  <td className={`px-4 py-2 font-extrabold ${TONE[r.action] ?? ""}`}>{r.action}</td>
                  <td className="px-4 py-2 font-semibold text-[var(--text-muted)]">
                    {r.targetType === "workspace" ? (
                      <Link href={`/admin/customers/${r.targetId}`} className="underline underline-offset-2">
                        {r.targetType}:{r.targetId.slice(0, 8)}
                      </Link>
                    ) : (
                      `${r.targetType}:${r.targetId.slice(0, 8)}`
                    )}
                  </td>
                  <td className="px-4 py-2 font-semibold text-[var(--text-muted)]">{r.reason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
