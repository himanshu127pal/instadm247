import Link from "next/link";
import { LifeBuoy, Lock } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_STATUS } from "@/lib/support";
import { timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/bits";
import { NewTicketToggle } from "@/components/dashboard/support-view";

export const dynamic = "force-dynamic";

const TONE = { open: "warning", answered: "info", closed: "neutral" } as const;

export default async function SupportPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const tickets = await prisma.supportTicket.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { lastActivityAt: "desc" },
    take: 100,
    include: { _count: { select: { messages: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Support"
        description="Ask us anything. Every ticket is kept here with our replies, and we email you when we answer."
        actions={tickets.length > 0 ? <NewTicketToggle categories={TICKET_CATEGORIES} startOpen={false} /> : undefined}
      />

      <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-3 text-[12.5px] text-[var(--text-muted)]">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        Only your team and our support staff can see your tickets. For a quick how-to, the AI Helper usually answers faster.
      </p>

      {tickets.length === 0 ? (
        <NewTicketToggle categories={TICKET_CATEGORIES} startOpen />
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)]">
          {tickets.map((t) => (
            <li key={t.id} className="border-b-2 border-[var(--border-soft)] last:border-0">
              <Link href={`/dashboard/support/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]">
                <LifeBuoy className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{t.subject}</span>
                  <span className="block text-[11.5px] text-[var(--text-faint)]">
                    {TICKET_CATEGORIES[t.category as keyof typeof TICKET_CATEGORIES] ?? t.category} · {t._count.messages} message
                    {t._count.messages === 1 ? "" : "s"} · {timeAgo(t.lastActivityAt)}
                  </span>
                </span>
                <Badge tone={TONE[t.status as keyof typeof TONE] ?? "neutral"}>{TICKET_STATUS[t.status as keyof typeof TICKET_STATUS] ?? t.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
