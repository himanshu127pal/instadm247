import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_STATUS } from "@/lib/support";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { TicketReply } from "@/components/dashboard/support-view";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const { id } = await params;
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, email: true } } } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/dashboard/support" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" /> All tickets
      </Link>
      <div>
        <h1 className="text-[22px] font-extrabold leading-tight">{ticket.subject}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <Badge tone={ticket.status === "open" ? "warning" : ticket.status === "answered" ? "info" : "neutral"}>
            {TICKET_STATUS[ticket.status as keyof typeof TICKET_STATUS] ?? ticket.status}
          </Badge>
          {TICKET_CATEGORIES[ticket.category as keyof typeof TICKET_CATEGORIES] ?? ticket.category} · opened {timeAgo(ticket.createdAt)}
        </p>
      </div>

      <ol className="space-y-3">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "rounded-xl border-2 p-3.5",
              m.fromStaff ? "border-[var(--accent)]/40 bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--bg-raised)]",
            )}
          >
            <p className="mb-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
              {m.fromStaff ? "InstaDM247 support" : m.author?.name || m.author?.email || "You"} · {timeAgo(m.createdAt)}
            </p>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{m.body}</p>
          </li>
        ))}
      </ol>

      <TicketReply ticketId={ticket.id} closed={ticket.status === "closed"} />
    </div>
  );
}
