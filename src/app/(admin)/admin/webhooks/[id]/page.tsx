import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebhookEvent } from "@/lib/admin-queries";
import { audit, getPlatformStaff } from "@/lib/admin";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-t border-[var(--border-soft)] py-2 first:border-t-0">
      <dt className="w-40 shrink-0 text-[12px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[13.5px] font-semibold">{children}</dd>
    </div>
  );
}

export default async function WebhookDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, staff] = await Promise.all([getWebhookEvent(id), getPlatformStaff()]);
  if (!event || !staff) notFound();

  // A raw payload carries the follower's message text and their IGSID, which is
  // the customer's data about a third party. Reading one is a privileged act,
  // so it goes in the same log as suspensions and impersonation — awaited, so a
  // failure to record is a failure to display.
  await audit({
    actorUserId: staff.id,
    action: "webhook.payload.view",
    targetType: event.account?.workspaceId ? "workspace" : "account",
    targetId: event.account?.workspaceId ?? event.accountId ?? event.id,
    meta: { webhookEventId: event.id, field: event.field },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/webhooks"
          className="text-[12.5px] font-bold text-[var(--text-muted)] underline underline-offset-2"
        >
          ← All deliveries
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold">
          <span className="font-mono">{event.field}</span>
        </h1>
      </div>

      <section className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
        <dl>
          <Row label="Received">{event.createdAt.toISOString()}</Row>
          <Row label="Account">
            {event.account ? (
              `@${event.account.username}`
            ) : (
              <span className="text-[var(--color-zonk-500)]">
                No connected account matched this delivery, so nothing ran.
              </span>
            )}
          </Row>
          <Row label="Customer">
            {event.account?.workspaceId ? (
              <Link
                href={`/admin/customers/${event.account.workspaceId}`}
                className="underline underline-offset-2"
              >
                {event.account.workspace.name}
              </Link>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Processed">
            {event.processed
              ? (event.processedAt?.toISOString() ?? "yes")
              : "not yet — still queued, or the worker is not running"}
          </Row>
          {event.error && (
            <Row label="Error">
              <span className="text-[var(--color-zonk-500)]">{event.error}</span>
            </Row>
          )}
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-extrabold">Raw payload</h2>
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--text-muted)]">
          Exactly what Instagram sent. This includes the sender&rsquo;s message text and
          their scoped ID, which is the customer&rsquo;s data about one of their followers
          — this view is recorded in the audit log.
        </p>
        <pre className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-sunken)] p-4 text-[12px] leading-relaxed">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </section>
    </div>
  );
}
