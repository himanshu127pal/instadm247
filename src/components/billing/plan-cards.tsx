"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import {
  FEATURE_LABELS,
  PLANS,
  type BillingInterval,
  type Feature,
  type PlanKey,
} from "@/lib/billing/plans";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The plan cards, used by BOTH the public pricing page and the dashboard's
 * billing page, and fed straight from src/lib/billing/plans.ts — so the price a
 * customer sees can never disagree with the price they are charged.
 */

const SHOWN: PlanKey[] = ["free", "pro", "business"];

/** What each plan adds over the one below it, so the cards read as a ladder. */
function highlights(key: PlanKey): string[] {
  const plan = PLANS[key];
  const lines = [
    `${plan.limits.instagramAccounts} Instagram account${plan.limits.instagramAccounts === 1 ? "" : "s"}`,
    `${formatNumber(plan.limits.dmsPerMonth)} automated DMs / month`,
    plan.limits.aiRepliesPerMonth > 0
      ? `${formatNumber(plan.limits.aiRepliesPerMonth)} AI replies / month`
      : "Post, Reel & Story AutoDM",
    ...(plan.limits.helperQuestionsPerWeek > 0
      ? [`AI Helper: ${formatNumber(plan.limits.helperQuestionsPerWeek)} questions / week`]
      : []),
  ];
  const below: PlanKey | null = key === "business" ? "pro" : key === "pro" ? "free" : null;
  const added = [...plan.features].filter((f: Feature) => !below || !PLANS[below].features.has(f));
  if (key === "free") {
    lines.push("Story mentions, DM keywords, comment replies", "Inbox starters & link in bio");
  } else {
    // The helper already has its own line, with its allowance.
    lines.push(...added.filter((f) => f !== "aiHelper").map((f) => FEATURE_LABELS[f]));
  }
  return lines;
}

export function PlanCards({
  mode,
  currentPlan,
  canCheckout = false,
}: {
  /** marketing: buttons go to sign-up. dashboard: buttons start a checkout. */
  mode: "marketing" | "dashboard";
  currentPlan?: string;
  canCheckout?: boolean;
}) {
  const [interval, setInterval] = React.useState<BillingInterval>("year");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function checkout(plan: "pro" | "business") {
    setBusy(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start checkout.");
      window.location.href = json.url;
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-1">
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-[13.5px] font-bold transition-colors",
                interval === i
                  ? "bg-[var(--color-pow-400)] text-[#12110e]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {i === "month" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SHOWN.map((key) => {
          const plan = PLANS[key];
          const price = plan.price!;
          const isCurrent = currentPlan === key;
          const featured = key === "pro";
          const perMonth = interval === "year" ? price.year / 12 : price.month;
          return (
            <div
              key={key}
              className={cn(
                "relative flex flex-col rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]",
                featured && "md:-translate-y-2",
              )}
            >
              {featured && (
                <span className="absolute -top-3 left-5 rounded-full border-2 border-[var(--border)] bg-[var(--color-pow-400)] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#12110e]">
                  Most popular
                </span>
              )}
              <h3 className="text-[20px]">{plan.name}</h3>
              <p className="mt-1 min-h-[40px] text-[13px] font-semibold text-[var(--text-muted)]">{plan.tagline}</p>

              <p className="mt-3">
                <span className="text-[34px] font-extrabold leading-none">
                  ${Number.isInteger(perMonth) ? perMonth : perMonth.toFixed(2)}
                </span>
                <span className="text-[13px] font-bold text-[var(--text-muted)]"> / month</span>
              </p>
              <p className="min-h-[18px] text-[12px] font-semibold text-[var(--text-faint)]">
                {price.month > 0 && interval === "year" ? `Billed $${price.year} yearly` : ""}
              </p>

              <ul className="mt-4 flex-1 space-y-2">
                {highlights(key).map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[13px] font-semibold">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-boom-500)]" />
                    {line}
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {mode === "marketing" ? (
                  <Link href={key === "free" ? "/signup" : `/signup?plan=${key}`}>
                    <Button variant={featured ? "gradient" : "secondary"} className="w-full">
                      {key === "free" ? "Start free" : `Start with ${plan.name}`}
                    </Button>
                  </Link>
                ) : isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Your plan
                  </Button>
                ) : key === "free" ? (
                  <p className="text-center text-[12.5px] font-semibold text-[var(--text-faint)]">
                    Cancel from “Manage subscription” to return to Free.
                  </p>
                ) : (
                  <Button
                    variant={featured ? "gradient" : "secondary"}
                    className="w-full"
                    disabled={!canCheckout || busy !== null}
                    loading={busy === key}
                    onClick={() => void checkout(key as "pro" | "business")}
                  >
                    {`Upgrade to ${plan.name}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mx-auto flex max-w-2xl items-start justify-center gap-2 text-center text-[13px] font-semibold text-[var(--text-muted)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-boom-500)]" />
        Every safety feature is included on every plan, free included — Slow Down mode, Viral
        Post Protection, the 24-hour messaging window and rate limits under Instagram&rsquo;s own.
        Keeping your account safe is not an upgrade.
      </p>

      {/* The pricing page carries this in its own footnote. */}
      {mode === "dashboard" && (
        <p className="text-center text-[12.5px] font-semibold text-[var(--text-faint)]">
          Monthly plans aren&rsquo;t refundable. Annual plans can be refunded, less the months used
          at the monthly price —{" "}
          <Link href="/refunds" className="underline hover:text-[var(--text-muted)]">
            refund policy
          </Link>
          .
        </p>
      )}
    </div>
  );
}
