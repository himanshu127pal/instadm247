import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { TRUST_LABEL, TRUST_PATH } from "@/lib/trust";
import { cn } from "@/lib/utils";

/**
 * Our standing with Meta, linking to what it means. Deliberately no Meta logo:
 * Meta's brand rules don't allow third parties to use it as a badge. See
 * docs/TRUST.md.
 */
export function MetaBadge({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <Link
      href={TRUST_PATH}
      title="What being a Meta Tech Provider means for you"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-[var(--border)] bg-[var(--color-pow-400)]/90 font-extrabold text-[#12110e] transition-transform hover:-translate-y-0.5",
        size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[13px] shadow-[3px_3px_0_0_var(--shadow-ink)]",
        className,
      )}
    >
      <ShieldCheck className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {TRUST_LABEL}
    </Link>
  );
}
