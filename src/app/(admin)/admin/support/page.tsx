import Link from "next/link";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_STATUS } from "@/lib/support";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Support tickets, waiting-on-us first (oldest first, so nobody waits longest). */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status ?? "open";
  const tickets = await prisma.supportTicket.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { lastActivityAt: status === "open" ? "asc" : "desc" },
    take: 200,
    include: { workspace: { select: { name: true } }, createdBy: { select: { email: true } }, _count: { select: { messages: true } } },
  });
  const counts = await prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } });
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-5">
      <h1 className="text-[24px] font-extrabold">Support tickets</h1>
      <div className="flex flex-wrap gap-1.5">
        {[...Object.entries(TICKET_STATUS), ["all", "All"] as const].map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/support?status=${key}`}
            className={`rounded-lg border-2 px-3 py-1 text-[13px] font-bold ${status === key ? "border-[var(--border)] bg-[var(--bg-sunken)]" : "border-transparent text-[var(--text-muted)]"}`}
          >
            {label}
            {key !== "all" && ` (${count(key)})`}
          </Link>
        ))}
      </div>
      {tickets.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)]">Nothing here.</p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11.5px] uppercase tracking-wider text-[var(--text-faint)]">
            <tr>
              <th className="py-2">Subject</th>
              <th>Workspace</th>
              <th>About</th>
              <th>Messages</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t-2 border-[var(--border-soft)]">
                <td className="py-2.5 pr-3">
                  <Link href={`/admin/support/${t.id}`} className="font-semibold hover:underline">
                    {t.subject}
                  </Link>
                  <span className="block text-[11.5px] text-[var(--text-faint)]">{t.createdBy?.email ?? "Deleted user"}</span>
                </td>
                <td>{t.workspace.name}</td>
                <td>{TICKET_CATEGORIES[t.category as keyof typeof TICKET_CATEGORIES] ?? t.category}</td>
                <td>{t._count.messages}</td>
                <td>{timeAgo(t.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
