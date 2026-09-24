"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function EmailRetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      disabled={busy}
      className="font-semibold underline underline-offset-2 disabled:opacity-60"
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/admin/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "retry", id }),
          });
          const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
          if (res.ok) toast.success(`Retried — ${data.status}`);
          else toast.error(data.error ?? "Couldn't retry.");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Retrying…" : "Retry"}
    </button>
  );
}
