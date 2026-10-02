import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_STATUS } from "@/lib/support";
import { timeAgo } from "@/lib/utils";
import { StaffTicketActions } from "@/components/admin/support-actions";

export const dynamic = "force-dynamic";

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      workspace: { select: { id: true, name: true, planKey: true } },
      createdBy: { select: { email: true, name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { email: true, name: true } } } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/admin/support" className="text-[13px] font-semibold text-[var(--text-muted)] hover:underline">
        ← All tickets
      </Link>
      <div>
        <h1 className="text-[22px] font-extrabold">{ticket.subject}</h1>
        <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          <Link href={`/admin/customers/${ticket.workspace.id}`} className="font-semibold underline">
            {ticket.workspace.name}
          </Link>{" "}
          ({ticket.workspace.planKey}) · {ticket.createdBy?.email ?? "Deleted user"} ·{" "}
          {TICKET_CATEGORIES[ticket.category as keyof typeof TICKET_CATEGORIES] ?? ticket.category} · opened {timeAgo(ticket.createdAt)} ·{" "}
          {TICKET_STATUS[ticket.status as keyof typeof TICKET_STATUS] ?? ticket.status}
        </p>
      </div>
      <ol className="space-y-3">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-xl border-2 p-3.5 ${m.fromStaff ? "border-[var(--accent)]/40 bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--bg-raised)]"}`}
          >
            <p className="mb-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
              {m.fromStaff ? `Staff (${m.author?.email ?? "unknown"})` : m.author?.email ?? "Customer"} · {timeAgo(m.createdAt)}
            </p>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{m.body}</p>
          </li>
        ))}
      </ol>
      <StaffTicketActions ticketId={ticket.id} status={ticket.status} statuses={TICKET_STATUS} />
    </div>
  );
}
