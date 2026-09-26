"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Staff billing controls. Same rule as the other privileged actions: a reason
 * is typed before anything changes, and nothing that alters what a customer pays
 * for or receives fires on a single click. Resync is the one exception — it
 * only applies Dodo's own record, so it cannot grant anything that isn't real.
 */

async function post(body: unknown) {
  const res = await fetch("/api/admin/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as { plan?: string; note?: string; refund?: string; quote?: RefundQuote };
}

type RefundQuote = {
  paid: string;
  refund: string;
  amount: number;
  monthsUsed: number;
  monthsUnused: number;
  paymentId: string;
  refundAlreadyIssued: boolean;
};

const btn =
  "rounded-lg border-2 border-[var(--border-soft)] px-3 py-1.5 text-[12.5px] font-bold hover:border-[var(--border)] disabled:opacity-50";
const input =
  "w-full rounded-lg border-2 border-[var(--border-soft)] bg-[var(--bg)] px-2.5 py-1.5 text-[13px] font-semibold";

export function PlanOverrideControl({
  workspaceId,
  hasOverride,
  canManage,
}: {
  workspaceId: string;
  hasOverride: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<null | "set" | "clear">(null);
  const [plan, setPlan] = React.useState("pro");
  const [until, setUntil] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  if (!canManage) {
    return (
      <p className="text-[12px] font-semibold text-[var(--text-faint)]">
        Changing a customer&rsquo;s plan requires the admin role.
      </p>
    );
  }

  async function submit() {
    setBusy(true);
    try {
      const result =
        mode === "clear"
          ? await post({ action: "clear_override", workspaceId, reason })
          : await post({
              action: "override",
              workspaceId,
              plan,
              reason,
              notify,
              ...(until ? { until: new Date(`${until}T23:59:59Z`).toISOString() } : {}),
            });
      toast.success(`Plan is now ${result.plan}`);
      setMode(null);
      setReason("");
      setUntil("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => setMode("set")}>
          {hasOverride ? "Change override" : "Grant a plan"}
        </button>
        {hasOverride && (
          <button className={btn} onClick={() => setMode("clear")}>
            Remove override
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border-2 border-[var(--color-zap-400)] bg-[var(--bg-raised)] p-3">
      <p className="text-[12.5px] font-bold">
        {mode === "clear"
          ? "The customer drops to whatever their subscription gives them (Free if none)."
          : "An override can only raise a customer's plan, never lower what they pay for."}
      </p>
      {mode === "set" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            Plan
            <select className={input} value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="pro">Pro</option>
              <option value="business">Business</option>
              <option value="unlimited">Unlimited</option>
              <option value="free">Free (no effect over a subscription)</option>
            </select>
          </label>
          <label className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            Until (optional, UTC)
            <input type="date" className={input} value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>
      )}
      {mode === "set" && (
        <label className="flex items-center gap-2 text-[12.5px] font-semibold">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email the customer that their plan was upgraded
        </label>
      )}
      <textarea
        className={input}
        rows={2}
        placeholder="Why? Kept in the audit log (at least 10 characters)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <button className={btn} disabled={busy || reason.trim().length < 10} onClick={() => void submit()}>
          {busy ? "Working…" : mode === "clear" ? "Remove override" : "Apply"}
        </button>
        <button className={btn} disabled={busy} onClick={() => setMode(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SubscriptionActions({
  workspaceId,
  subscriptionId,
  cancellable,
  canCancel,
  refundable,
}: {
  workspaceId: string;
  subscriptionId: string;
  cancellable: boolean;
  canCancel: boolean;
  /** An active annual plan — the only kind the refund policy covers. */
  refundable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  async function resync() {
    setBusy(true);
    try {
      const result = await post({ action: "resync", workspaceId, subscriptionId });
      toast.success(result.note || "Resynced from Dodo");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await post({ action: "cancel", workspaceId, subscriptionId, reason });
      toast.success("Cancellation scheduled for the end of the period. Dodo will confirm by webhook.");
      setCancelOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={busy} onClick={() => void resync()}>
          {busy && !cancelOpen ? "Working…" : "Resync from Dodo"}
        </button>
        {cancellable && canCancel && !cancelOpen && (
          <button className={btn} disabled={busy} onClick={() => setCancelOpen(true)}>
            Cancel at period end
          </button>
        )}
      </div>
      {refundable && <AnnualRefund workspaceId={workspaceId} subscriptionId={subscriptionId} canRefund={canCancel} />}
      {cancelOpen && (
        <div className="space-y-2 rounded-lg border-2 border-[var(--color-zap-400)] bg-[var(--bg-raised)] p-3">
          <p className="text-[12.5px] font-bold">
            Stops renewal. They keep the plan until the period they paid for ends. For an annual
            refund under the policy, use &ldquo;Refund annual plan&rdquo; instead.
          </p>
          <textarea
            className={input}
            rows={2}
            placeholder="Why? Kept in the audit log and sent to Dodo (at least 10 characters)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button className={btn} disabled={busy || reason.trim().length < 10} onClick={() => void cancel()}>
              {busy ? "Working…" : "Schedule cancellation"}
            </button>
            <button className={btn} disabled={busy} onClick={() => setCancelOpen(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The refund policy's one refundable case: an annual plan, refunded less the
 * months used at the monthly price, counted to the day the request reached support.
 * Preview first — the numbers come from our payment trace, not from staff —
 * then refund, which also ends the plan.
 */
function AnnualRefund({
  workspaceId,
  subscriptionId,
  canRefund,
}: {
  workspaceId: string;
  subscriptionId: string;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [day, setDay] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [quote, setQuote] = React.useState<RefundQuote | null>(null);
  const [reason, setReason] = React.useState("");

  // The start of that UTC day: a month that began later the same day isn't
  // counted against the customer, and the same date always gives the same sum.
  const requestedAt = () => new Date(`${day}T00:00:00Z`).toISOString();

  async function preview() {
    setBusy(true);
    setQuote(null);
    try {
      const result = await post({ action: "refund_quote", workspaceId, subscriptionId, requestedAt: requestedAt() });
      setQuote(result.quote ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!quote) return;
    setBusy(true);
    try {
      const result = await post({
        action: "refund_annual",
        workspaceId,
        subscriptionId,
        requestedAt: requestedAt(),
        expectedAmount: quote.amount,
        reason,
      });
      toast.success(`Refunded ${result.refund} and ended the plan. Dodo will confirm by webhook.`);
      setOpen(false);
      setQuote(null);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className={btn} onClick={() => setOpen(true)}>
        Refund annual plan
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border-2 border-[var(--color-zap-400)] bg-[var(--bg-raised)] p-3">
      <p className="text-[12.5px] font-bold">
        Refunds what they paid for the year, less the months used charged at the monthly price,
        and ends the plan now. The month in progress counts as used.
      </p>
      <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
        Request reached support on (UTC)
        <input
          type="date"
          className={input}
          value={day}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => {
            setDay(e.target.value);
            setQuote(null);
          }}
        />
      </label>
      <div className="flex gap-2">
        <button className={btn} disabled={busy || !day} onClick={() => void preview()}>
          {busy && !quote ? "Working…" : "Preview refund"}
        </button>
        <button className={btn} disabled={busy} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {quote && (
        <div className="space-y-2 border-t-2 border-[var(--border-soft)] pt-2">
          <p className="text-[13px] font-semibold">
            Paid {quote.paid} · {quote.monthsUsed} {quote.monthsUsed === 1 ? "month" : "months"} used,
            charged at the monthly price · <strong>refund {quote.refund}</strong>
          </p>
          <p className="break-all font-mono text-[11.5px] text-[var(--text-faint)]">payment {quote.paymentId}</p>
          {quote.refundAlreadyIssued && (
            <p className="text-[12.5px] font-bold text-[var(--color-zap-500)]">
              This refund was already issued; the plan wasn&rsquo;t ended. Refunding again only
              retries ending it. No money moves twice.
            </p>
          )}
          {canRefund ? (
            <>
              <textarea
                className={input}
                rows={2}
                placeholder="The request, e.g. who emailed and when. Kept in the audit log and sent to Dodo (at least 10 characters)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button className={btn} disabled={busy || reason.trim().length < 10} onClick={() => void refund()}>
                {busy ? "Working…" : `Refund ${quote.refund} and end the plan`}
              </button>
            </>
          ) : (
            <p className="text-[12px] font-semibold text-[var(--text-faint)]">
              Issuing the refund requires the admin role.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
