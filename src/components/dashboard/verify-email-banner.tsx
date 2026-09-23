"use client";

import * as React from "react";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";

/**
 * Shown until the address is verified. Dismissable for the page view only —
 * it comes back on the next load, because billing receipts and account alerts
 * go to this address and we want it right.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [hidden, setHidden] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  if (hidden) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--border-soft)] bg-[var(--bg-sunken)] px-4 py-2 text-[13px]">
      <MailWarning className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span>
        Confirm your email — we sent a link to <strong>{email}</strong>.
      </span>
      <button
        disabled={sending}
        onClick={async () => {
          setSending(true);
          try {
            const res = await fetch("/api/auth/verify/resend", { method: "POST" });
            const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string; verified?: boolean };
            if (res.ok) {
              toast.success(data.message ?? "Sent.");
              if (data.verified) setHidden(true);
            } else {
              toast.error(data.error ?? "Couldn't send the email.");
            }
          } catch {
            toast.error("Couldn't reach the server.");
          } finally {
            setSending(false);
          }
        }}
        className="font-semibold text-[var(--accent)] hover:underline disabled:opacity-60"
      >
        {sending ? "Sending…" : "Resend email"}
      </button>
      <button
        onClick={() => setHidden(true)}
        className="ml-auto text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text)]"
        aria-label="Hide for now"
      >
        Later
      </button>
    </div>
  );
}
