"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  delta?: number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "brand" | "success" | "warning";
}) {
  const toneRing: Record<string, string> = {
    neutral: "text-[var(--text-muted)] bg-[var(--bg-sunken)]",
    brand: "text-[var(--accent)] bg-[var(--accent)]/10",
    success: "text-emerald-400 bg-emerald-500/10",
    warning: "text-amber-400 bg-amber-500/10",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-[var(--text-muted)]">{label}</p>
        {Icon && (
          <span className={cn("grid h-8 w-8 place-items-center rounded-xl", toneRing[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {typeof delta === "number" && Number.isFinite(delta) && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11.5px] font-medium",
              delta >= 0 ? "text-emerald-400" : "text-red-400",
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-[11.5px] text-[var(--text-faint)]">{hint}</span>}
      </div>
    </motion.div>
  );
}

/** Small inline sparkline — no chart library needed for a 7-point trend. */
export function Sparkline({
  points,
  className,
  stroke = "var(--accent)",
}: {
  points: number[];
  className?: string;
  stroke?: string;
}) {
  if (points.length < 2) return null;

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const width = 100;
  const height = 28;

  const path = points
    .map((value, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)]",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <div>
            {title && <h2 className="text-[14.5px] font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Copy-to-clipboard chip, used for webhook URLs and draft codes. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className="group flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)]"
    >
      <span className="min-w-0 flex-1">
        {label && <span className="block text-[11px] text-[var(--text-faint)]">{label}</span>}
        <span className="block truncate font-mono text-[12.5px]">{value}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-[11px] font-medium transition-colors",
          copied ? "text-emerald-400" : "text-[var(--text-faint)] group-hover:text-[var(--accent)]",
        )}
      >
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] no-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative shrink-0 px-3.5 py-2.5 text-[13.5px] transition-colors",
              isActive ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className="ml-1.5 rounded-full bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[10.5px]">
                {tab.count}
              </span>
            )}
            {isActive && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
