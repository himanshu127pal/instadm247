import Link from "next/link";
import { notFound } from "next/navigation";
import { getPaymentEvent } from "@/lib/admin-queries";
import { audit, getPlatformStaff } from "@/lib/admin";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-t border-[var(--border-soft)] py-2 first:border-t-0">
      <dt className="w-44 shrink-0 text-[12px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-all text-[13.5px] font-semibold">{children}</dd>
    </div>
  );
}

export default async function PaymentEventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, staff] = await Promise.all([getPaymentEvent(id), getPlatformStaff()]);
  if (!event || !staff) notFound();

  // Provider payloads carry a customer's name, email and billing address.
  // Opening one is logged, the same as opening an Instagram webhook payload.
  await audit({
    actorUserId: staff.id,
    action: "billing.event.view",
    targetType: "workspace",
    targetId: event.workspaceId ?? event.id,
    meta: { paymentEventId: event.id, type: event.type },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/billing" className="text-[12.5px] font-bold text-[var(--text-muted)] underline underline-offset-2">
          ← All billing events
        </Link>
        <h1 className="mt-2 font-mono text-[22px] font-extrabold">{event.type ?? "(no type)"}</h1>
      </div>

      <section className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
        <dl>
          <Row label="Direction">{event.direction === "inbound" ? "Webhook from Dodo" : "Call we made to Dodo"}</Row>
          <Row label="Received">{event.receivedAt.toISOString()}</Row>
          <Row label="Outcome">
            {event.status}
            {event.httpStatus ? ` · answered ${event.httpStatus}` : ""}
          </Row>
          {event.direction === "inbound" && (
            <Row label="Signature">
              {event.signatureValid === true ? "valid" : event.signatureValid === false ? "INVALID" : "—"}
            </Row>
          )}
          {event.webhookId && <Row label="webhook-id">{event.webhookId}</Row>}
          <Row label="Customer">
            {event.workspace ? (
              <Link href={`/admin/customers/${event.workspace.id}`} className="underline underline-offset-2">
                {event.workspace.name}
              </Link>
            ) : (
              "not matched to a workspace"
            )}
          </Row>
          {event.providerCustomerId && <Row label="Dodo customer">{event.providerCustomerId}</Row>}
          {event.providerSubscriptionId && <Row label="Dodo subscription">{event.providerSubscriptionId}</Row>}
          {event.providerPaymentId && <Row label="Dodo payment">{event.providerPaymentId}</Row>}
          {event.amount != null && (
            <Row label="Amount">
              {(event.amount / 100).toFixed(2)} {event.currency}
            </Row>
          )}
          {event.note && <Row label="Note">{event.note}</Row>}
          {event.error && (
            <Row label="Error">
              <span className="text-[var(--color-zonk-500)]">{event.error}</span>
            </Row>
          )}
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-extrabold">Payload</h2>
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--text-muted)]">
          {event.signatureValid === false
            ? "Unauthenticated input — this did not come from Dodo, or the secret is wrong. Stored capped at 8 KB and purged after 30 days."
            : "Exactly what was sent or received. This view is recorded in the audit log."}
        </p>
        <pre className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-sunken)] p-4 text-[12px] leading-relaxed">
          {JSON.stringify(event.payload, null, 2) ?? "(none)"}
        </pre>
      </section>
    </div>
  );
}
