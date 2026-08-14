"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Comic UI kit.
 *
 * Everything is drawn with an ink outline and a hard offset shadow, and presses
 * like a physical sticker. Buttons get a starburst on hover — the payoff the
 * whole theme is built around.
 */

// --- Button -----------------------------------------------------------------

const buttonVariants = cva(
  [
    "burst-host relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-xl font-extrabold tracking-tight select-none",
    "border-[2.5px] border-[var(--border)]",
    "shadow-[3px_3px_0_0_var(--shadow-ink)]",
    "transition-[transform,box-shadow,background-color] duration-150",
    "hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[5px_5px_0_0_var(--shadow-ink)]",
    "active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_0_var(--shadow-ink)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "disabled:translate-x-0 disabled:translate-y-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-[var(--color-kapow-400)] text-white",
        gradient:
          "bg-[linear-gradient(100deg,var(--color-zap-400),var(--color-kapow-400)_55%,var(--color-bam-400))] text-white",
        pow: "bg-[var(--color-pow-400)] text-[#12110e]",
        secondary: "bg-[var(--bg-raised)] text-[var(--text)]",
        outline: "bg-transparent text-[var(--text)]",
        ghost:
          "border-transparent shadow-none bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)] hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0",
        danger: "bg-[var(--color-zap-400)] text-white",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-[14px]",
        lg: "h-12 px-6 text-[16px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /** Set false to suppress the starburst (dense toolbars, icon-only rows). */
  burst?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, burst = true, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {burst && variant !== "ghost" && (
        <>
          <span
            aria-hidden
            className="burst -left-2 -top-2 h-5 w-5 bg-[var(--color-pow-400)]"
          />
          <span
            aria-hidden
            className="burst -bottom-2 -right-3 h-4 w-4 bg-[var(--color-bam-400)]"
            style={{ animationDelay: "0.06s" }}
          />
        </>
      )}
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// --- Card -------------------------------------------------------------------

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)]",
        "shadow-[4px_4px_0_0_var(--shadow-ink)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[16px] font-extrabold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-[var(--text-muted)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

// --- Inputs -----------------------------------------------------------------

const fieldBase = [
  "w-full rounded-xl bg-[var(--bg)] font-semibold text-[var(--text)]",
  "border-2 border-[var(--border)]",
  "placeholder:font-medium placeholder:text-[var(--text-faint)]",
  "transition-shadow duration-150",
  "focus:outline-none focus:shadow-[3px_3px_0_0_var(--color-pow-400)]",
  "disabled:opacity-60",
].join(" ");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, "h-10 px-3 text-sm", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "min-h-[88px] resize-y px-3 py-2.5 text-sm leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldBase,
      "h-10 appearance-none px-3 pr-8 text-sm",
      "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22currentColor%22 stroke-width=%223%22><path stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M19 9l-7 7-7-7%22/></svg>')] bg-[length:15px] bg-[right_0.6rem_center] bg-no-repeat",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-[13px] font-extrabold text-[var(--text)]", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && !error && (
        <p className="text-xs font-medium text-[var(--text-faint)]">{hint}</p>
      )}
      {error && (
        <p className="text-xs font-bold text-[var(--color-zap-500)]">{error}</p>
      )}
    </div>
  );
}

// --- Toggle -----------------------------------------------------------------

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full",
        "border-[2.5px] border-[var(--border)] transition-colors duration-200",
        "shadow-[2px_2px_0_0_var(--shadow-ink)]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-pow-400)]",
        checked ? "bg-[var(--color-boom-400)]" : "bg-[var(--bg-sunken)]",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] rounded-full border-2 border-[var(--border)] bg-white",
          "transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

// --- Badge ------------------------------------------------------------------

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
    "text-[11px] font-extrabold uppercase leading-5 tracking-wide",
    "border-2 border-[var(--border)]",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral: "bg-[var(--bg-sunken)] text-[var(--text)]",
        brand: "bg-[var(--color-kapow-400)] text-white",
        success: "bg-[var(--color-boom-400)] text-[#12110e]",
        warning: "bg-[var(--color-pow-400)] text-[#12110e]",
        danger: "bg-[var(--color-zap-400)] text-white",
        info: "bg-[var(--color-bam-400)] text-[#12110e]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// --- Misc -------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed border-[var(--border-soft)] bg-[var(--bg-sunken)]",
        "animate-pulse",
        className,
      )}
    />
  );
}

/**
 * `icon` takes a rendered element, not a component reference — a function can't
 * cross the Server/Client Component boundary.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 overflow-hidden",
        "rounded-[var(--radius-card)] border-[3px] border-dashed border-[var(--border)]",
        "bg-[var(--bg-raised)] px-6 py-14 text-center",
      )}
    >
      <div aria-hidden className="halftone pointer-events-none absolute inset-0 opacity-40" />
      {icon && (
        <div className="relative grid h-14 w-14 place-items-center rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)] text-[#12110e] shadow-[3px_3px_0_0_var(--shadow-ink)] [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <div className="relative space-y-1">
        <p className="font-heading text-[18px]">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-[13.5px] font-medium text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="relative">{action}</div>}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap",
          "rounded-lg border-2 border-[var(--border)] bg-[var(--color-pow-400)] px-2.5 py-1",
          "text-[11px] font-bold text-[#12110e] opacity-0 shadow-[2px_2px_0_0_var(--shadow-ink)]",
          "transition-opacity duration-150 group-hover/tt:opacity-100",
        )}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * A comic sound-effect burst — "POW!", "ZAP!". Used sparingly on the marketing
 * page as a focal accent.
 */
export function SoundEffect({
  children,
  color = "var(--color-pow-400)",
  className,
  rotate = -8,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
  rotate?: number;
}) {
  return (
    <span
      className={cn("relative inline-grid place-items-center", className)}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <span
        aria-hidden
        className="absolute inset-0 -m-3"
        style={{
          background: color,
          clipPath:
            "polygon(50% 0%, 61% 22%, 84% 12%, 79% 37%, 100% 50%, 79% 63%, 84% 88%, 61% 78%, 50% 100%, 39% 78%, 16% 88%, 21% 63%, 0% 50%, 21% 37%, 16% 12%, 39% 22%)",
        }}
      />
      <span className="font-display relative px-2 text-[#12110e] [-webkit-text-stroke:1px_var(--border)]">
        {children}
      </span>
    </span>
  );
}
