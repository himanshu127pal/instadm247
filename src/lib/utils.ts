import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(value));
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** "3m ago", "2h ago", "Mar 4" — compact enough for list rows. */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);

  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Remaining time in the 24h messaging window, phrased for humans. */
export function windowCountdown(expiresAt: Date | string | null | undefined): {
  label: string;
  open: boolean;
  urgency: "open" | "closing" | "closed";
} {
  if (!expiresAt) return { label: "No window", open: false, urgency: "closed" };
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const ms = expiry.getTime() - Date.now();

  if (ms <= 0) return { label: "Window closed", open: false, urgency: "closed" };
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const label = hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  return { label, open: true, urgency: hours < 2 ? "closing" : "open" };
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

/** Deterministic pleasant colour from a string — used for avatars and tags. */
export function colorFromString(input: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash << 5) - hash + input.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue} 70% 92%)`, fg: `hsl(${hue} 70% 32%)` };
}
