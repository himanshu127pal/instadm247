import Link from "next/link";
import { notFound } from "next/navigation";
import { customerBilling, getCustomer } from "@/lib/admin-queries";
import { env } from "@/lib/env";
import { CustomerBilling } from "@/components/admin/customer-billing";
import { getPlatformStaff } from "@/lib/admin";
import { SKIP_EXPLANATIONS, type SkipReasonKey } from "@/lib/engine/guards";
import { AddNote, ImpersonateControl, SuspendControls } from "@/components/admin/actions";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
      <h2 className="mb-3 text-[14.5px] font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, staff, billing] = await Promise.all([
    getCustomer(id),
    getPlatformStaff(),
    customerBilling(id),
  ]);
  if (!data || !staff || !billing) notFound();

  const { workspace: w, stats, recentSkips } = data;
  const owner = w.memberships[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/customers" className="text-[12.5px] font-semibold underline underline-offset-2">
            ← Customers
          </Link>
          <h1 className="mt-1 text-[24px] font-extrabold">{w.name}</h1>
          <p className="text-[13px] font-semibold text-[var(--text-muted)]">
            /{w.slug} · plan <strong>{w.planKey}</strong> · joined{" "}
            {w.createdAt.toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {owner && (
            <ImpersonateControl workspaceId={w.id} userId={owner.userId} email={owner.user.email} />
          )}
          <SuspendControls
            workspaceId={w.id}
            workspaceName={w.name}
            suspended={Boolean(w.suspendedAt)}
            canSuspend={staff.role === "admin"}
          />
        </div>
      </div>

      {w.suspendedAt && (
        <div className="rounded-[var(--radius-card)] border-2 border-[var(--color-zap-400)] bg-[var(--color-zap-400)]/10 p-4">
          <p className="text-[13.5px] font-extrabold">
            Suspended {w.suspendedAt.toISOString().slice(0, 10)} — automations are not sending.
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[var(--text-muted)]">
            Shown at sign-in: “{w.suspendedReason ?? "no reason recorded"}”
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Instagram accounts", w.accounts.length],
          ["Automations", stats.automations],
          ["Contacts", stats.contacts],
          ["Sent (30d)", stats.sent30d],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] p-3">
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
            <p className="mt-1 text-[22px] font-extrabold leading-none">{formatNumber(Number(value))}</p>
          </div>
        ))}
      </div>

      <CustomerBilling
        workspaceId={w.id}
        data={billing}
        role={staff.role}
        billingEnabled={env.billing.enabled}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Instagram accounts">
          {w.accounts.length === 0 ? (
            <p className="text-[13px] font-semibold text-[var(--text-faint)]">None connected.</p>
          ) : (
            <ul className="space-y-2">
              {w.accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="font-bold">@{a.username}</span>
                    <Link
                      href={`/admin/webhooks?accountId=${a.id}`}
                      className="text-[11.5px] font-semibold text-[var(--text-faint)] underline underline-offset-2 hover:text-[var(--text)]"
                    >
                      webhooks
                    </Link>
                  </span>
                  <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-faint)]">
                    <span>{a.status}</span>
                    {a.automationPaused && (
                      <span className="text-[var(--color-zonk-500)]">paused</span>
                    )}
                    {a.tokenExpiresAt && (
                      <span title="Token expiry">tok {a.tokenExpiresAt.toISOString().slice(0, 10)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Webhook deliveries">
          <p className="text-[13px] font-semibold text-[var(--text-muted)]">
            Everything Instagram has sent for this customer in the last 30 days — the
            first place to look when their automations are not firing.
          </p>
          <Link
            href={`/admin/webhooks?workspaceId=${w.id}`}
            className="mt-2 inline-block text-[13px] font-bold underline underline-offset-2"
          >
            Open the delivery log →
          </Link>
        </Panel>

        <Panel title="Members">
          <ul className="space-y-2">
            {w.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="font-semibold">{m.user.email}</span>
                <span className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-[var(--text-faint)]">{m.role}</span>
                  <ImpersonateControl workspaceId={w.id} userId={m.userId} email={m.user.email} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Why sends were skipped (30 days)">
          {recentSkips.length === 0 ? (
            <p className="text-[13px] font-semibold text-[var(--text-faint)]">Nothing skipped.</p>
          ) : (
            <ul className="space-y-2">
              {recentSkips.map((s) => (
                <li key={s.skipReason ?? "unknown"} className="text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-bold">{s.skipReason ?? "unknown"}</span>
                    <span className="tabular-nums font-extrabold">{formatNumber(s._count._all)}</span>
                  </div>
                  <p className="text-[12px] font-semibold text-[var(--text-faint)]">
                    {SKIP_EXPLANATIONS[s.skipReason as SkipReasonKey] ?? ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Internal notes">
          <AddNote workspaceId={w.id} />
          <ul className="mt-4 space-y-3">
            {w.adminNotes.map((n) => (
              <li key={n.id} className="border-l-2 border-[var(--border-soft)] pl-3 text-[13px]">
                <p className="font-semibold">{n.body}</p>
                <p className="mt-0.5 text-[11.5px] font-semibold text-[var(--text-faint)]">
                  {n.author.email} · {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </p>
              </li>
            ))}
            {w.adminNotes.length === 0 && (
              <li className="text-[12.5px] font-semibold text-[var(--text-faint)]">No notes yet.</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
