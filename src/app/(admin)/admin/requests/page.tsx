import Link from "next/link";
import { prisma } from "@/lib/db";
import { REQUEST_AREAS, REQUEST_STATUS } from "@/lib/support";
import { timeAgo } from "@/lib/utils";
import { RequestControls } from "@/components/admin/support-actions";

export const dynamic = "force-dynamic";

/** Feature requests from customers, newest first. */
export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status ?? "new";
  const requests = await prisma.featureRequest.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { workspace: { select: { id: true, name: true, planKey: true } }, createdBy: { select: { email: true } } },
  });
  const counts = await prisma.featureRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-5">
      <h1 className="text-[24px] font-extrabold">Feature requests</h1>
      <div className="flex flex-wrap gap-1.5">
        {[...Object.entries(REQUEST_STATUS), ["all", "All"] as const].map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/requests?status=${key}`}
            className={`rounded-lg border-2 px-3 py-1 text-[13px] font-bold ${status === key ? "border-[var(--border)] bg-[var(--bg-sunken)]" : "border-transparent text-[var(--text-muted)]"}`}
          >
            {label}
            {key !== "all" && ` (${count(key)})`}
          </Link>
        ))}
      </div>
      {requests.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)]">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="grid gap-4 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-4 md:grid-cols-[1fr_320px]">
              <div>
                <p className="text-[15px] font-bold">{r.title}</p>
                <p className="text-[12px] text-[var(--text-faint)]">
                  {REQUEST_AREAS[r.area as keyof typeof REQUEST_AREAS] ?? r.area} ·{" "}
                  <Link href={`/admin/customers/${r.workspace.id}`} className="underline">
                    {r.workspace.name}
                  </Link>{" "}
                  ({r.workspace.planKey}) · {r.createdBy?.email ?? "Deleted user"} · {timeAgo(r.createdAt)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[13px]">
                  <span className="font-semibold">Problem: </span>
                  {r.problem}
                </p>
                {r.outcome && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px]">
                    <span className="font-semibold">Good outcome: </span>
                    {r.outcome}
                  </p>
                )}
              </div>
              <RequestControls id={r.id} status={r.status} note={r.staffNote} statuses={REQUEST_STATUS} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
