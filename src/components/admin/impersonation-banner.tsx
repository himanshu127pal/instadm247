"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";

/**
 * Deliberately loud, fixed to the top of the viewport, and impossible to
 * dismiss. Someone who forgets they are inside a customer's account is the way
 * this tool turns into an incident.
 */
export function ImpersonationBanner({
  email,
  byEmail,
  expiresAt,
}: {
  email: string;
  byEmail: string | null;
  expiresAt: string;
}) {
  const [left, setLeft] = React.useState("");

  React.useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) return setLeft("expired");
      const m = Math.floor(ms / 60000);
      setLeft(m >= 1 ? `${m} min left` : "under a minute left");
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <div className="sticky top-0 z-[100] flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-black bg-[var(--color-zonk-400)] px-4 py-2 text-[13px] font-extrabold text-[#12110e]">
      <EyeOff className="h-4 w-4 shrink-0" />
      <span>
        Viewing as <strong>{email}</strong>
        {byEmail && <span className="font-semibold">, signed in by {byEmail}</span>}
      </span>
      <span className="font-semibold opacity-80">Read-only · {left}</span>
      <button
        onClick={async () => {
          await fetch("/api/admin/impersonate", { method: "DELETE" });
          window.location.href = "/admin";
        }}
        className="ml-auto rounded-lg border-2 border-black bg-white/70 px-2.5 py-1 text-[12.5px] font-extrabold hover:bg-white"
      >
        Return to admin
      </button>
    </div>
  );
}
