import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REQUEST_AREAS, REQUEST_STATUS } from "@/lib/support";
import { timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/bits";
import { FeatureRequestForm } from "@/components/dashboard/support-view";

export const dynamic = "force-dynamic";

const TONE = { new: "neutral", planned: "info", in_progress: "warning", shipped: "success", declined: "neutral" } as const;

export default async function RequestsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const requests = await prisma.featureRequest.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Request a feature" description="Tell us what would make InstaDM247 work better for you. We read every request." />
      <FeatureRequestForm areas={REQUEST_AREAS} />

      <section>
        <h2 className="mb-1 text-[16px] font-extrabold">Your requests</h2>
        <p className="mb-3 text-[12.5px] text-[var(--text-muted)]">Only your team and ours can see these. We&rsquo;ll email you when one changes.</p>
        {requests.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center text-[12.5px] text-[var(--text-muted)]">
            Nothing yet. Your requests and our replies show up here.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold">{r.title}</p>
                  <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{REQUEST_STATUS[r.status as keyof typeof REQUEST_STATUS] ?? r.status}</Badge>
                </div>
                <p className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">
                  {REQUEST_AREAS[r.area as keyof typeof REQUEST_AREAS] ?? r.area} · {timeAgo(r.createdAt)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--text-muted)]">{r.problem}</p>
                {r.staffNote && (
                  <p className="mt-2 rounded-lg border-2 border-[var(--accent)]/30 bg-[var(--accent)]/5 p-2.5 text-[12.5px]">
                    <span className="font-semibold">From us: </span>
                    {r.staffNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
