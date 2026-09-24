import Link from "next/link";
import { Sparkles } from "lucide-react";
import { DM_BRANDING_LINE } from "@/lib/branding";

/**
 * Told up front, not discovered from a follower: on Free, automated DMs carry
 * a short line. Rendered only for workspaces whose plan keeps our branding.
 */
export function BrandingNotice() {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text-muted)]">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
      <span>
        On the Free plan, the first automated DM each person gets in a day ends with &ldquo;
        {DM_BRANDING_LINE}&rdquo;. Replies you type in the Inbox never do.
      </span>
      <Link href="/dashboard/billing" className="font-bold text-[var(--accent)] hover:underline">
        Upgrade to remove it
      </Link>
    </p>
  );
}
