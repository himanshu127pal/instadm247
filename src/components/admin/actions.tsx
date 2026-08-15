"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * The privileged actions, kept in one client component so every one of them
 * goes through the same "type a reason first" path. None of them fire on a
 * single click.
 */

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export function SuspendControls({
  workspaceId,
  workspaceName,
  suspended,
  canSuspend,
}: {
  workspaceId: string;
  workspaceName: string;
  suspended: boolean;
  canSuspend: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!canSuspend) {
    return (
      <p className="text-[12.5px] font-semibold text-[var(--text-faint)]">
        Suspending requires the admin role.
      </p>
    );
  }

  async function run(next: boolean) {
    setBusy(true);
    try {
      await post("/api/admin/suspend", { workspaceId, suspended: next, reason });
      toast.success(next ? "Customer suspended" : "Suspension lifted");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (suspended) {
    return (
      <button
        onClick={() => void run(false)}
        disabled={busy}
        className="rounded-lg border-2 border-[var(--border-soft)] px-3 py-1.5 text-[13px] font-bold hover:border-[var(--border)] disabled:opacity-50"
      >
        {busy ? "Working…" : "Lift suspension"}
      </button>
    );
  }

  return open ? (
    <div className="space-y-2 rounded-lg border-2 border-[var(--color-zap-400)] bg-[var(--bg-raised)] p-3">
      <p className="text-[12.5px] font-bold">
        This stops {workspaceName} sending anything, and shows the reason at sign-in.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Reason shown to the customer, e.g. “Unusual sending volume — email support@instadm247.com to resolve.”"
        className="w-full rounded-lg border-2 border-[var(--border-soft)] bg-[var(--bg)] p-2 text-[13px] font-semibold outline-none focus:border-[var(--border)]"
      />
      <div className="flex gap-2">
        <button
          onClick={() => void run(true)}
          disabled={busy || reason.trim().length < 10}
          className="rounded-lg bg-[var(--color-zap-500)] px-3 py-1.5 text-[13px] font-extrabold text-white disabled:opacity-40"
        >
          {busy ? "Working…" : "Suspend"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border-2 border-[var(--border-soft)] px-3 py-1.5 text-[13px] font-bold"
        >
          Cancel
        </button>
      </div>
      {reason.trim().length < 10 && (
        <p className="text-[11.5px] font-semibold text-[var(--text-faint)]">
          The customer reads this. Give them something actionable.
        </p>
      )}
    </div>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="rounded-lg border-2 border-[var(--color-zap-400)] px-3 py-1.5 text-[13px] font-bold text-[var(--color-zap-500)]"
    >
      Suspend customer
    </button>
  );
}

export function ImpersonateControl({
  workspaceId,
  userId,
  email,
}: {
  workspaceId: string;
  userId: string;
  email: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function go() {
    setBusy(true);
    try {
      await post("/api/admin/impersonate", { workspaceId, userId, reason });
      // Full navigation so the swapped session cookie is picked up everywhere.
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return open ? (
    <div className="space-y-2 rounded-lg border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] p-3">
      <p className="text-[12.5px] font-bold">Sign in as {email}</p>
      <p className="text-[11.5px] font-semibold text-[var(--text-faint)]">
        Read-only: the session can&rsquo;t send DMs or run broadcasts. Expires in an
        hour. Logged against your name.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason, e.g. “Ticket #412 — flow not triggering”"
        className="w-full rounded-lg border-2 border-[var(--border-soft)] bg-[var(--bg)] px-2 py-1.5 text-[13px] font-semibold outline-none focus:border-[var(--border)]"
      />
      <div className="flex gap-2">
        <button
          onClick={() => void go()}
          disabled={busy || reason.trim().length < 3}
          className="rounded-lg bg-[var(--text)] px-3 py-1.5 text-[13px] font-extrabold text-[var(--bg)] disabled:opacity-40"
        >
          {busy ? "Opening…" : "Sign in as customer"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border-2 border-[var(--border-soft)] px-3 py-1.5 text-[13px] font-bold"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="rounded-lg border-2 border-[var(--border-soft)] px-3 py-1.5 text-[13px] font-bold hover:border-[var(--border)]"
    >
      Sign in as…
    </button>
  );
}

export function AddNote({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await post("/api/admin/note", { workspaceId, body });
          setBody("");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-2"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Internal note — never shown to the customer"
        className="w-full rounded-lg border-2 border-[var(--border-soft)] bg-[var(--bg)] p-2 text-[13px] font-semibold outline-none focus:border-[var(--border)]"
      />
      <button
        type="submit"
        disabled={busy || body.trim().length < 2}
        className="rounded-lg border-2 border-[var(--border-soft)] px-3 py-1.5 text-[13px] font-bold disabled:opacity-40"
      >
        {busy ? "Saving…" : "Add note"}
      </button>
    </form>
  );
}
