import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getPlatformStaff } from "@/lib/admin";
import { PlanCards } from "@/components/billing/plan-cards";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free. Pro and Business add more accounts, more DMs, AI replies and advanced flows. Every safety feature is free on every plan.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  // Prices don't go public before anyone can pay them: a visitor clicking
  // "Start with Pro" when checkout isn't open is a promise we can't keep.
  // Staff can preview.
  if (!env.billing.enabled && !(await getPlatformStaff())) notFound();

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-[44px] leading-none sm:text-[56px]">Simple pricing</h1>
        <p className="mt-4 text-[16px] font-semibold text-[var(--text-muted)]">
          Start free. Upgrade when your DMs outgrow it. Cancel whenever — you keep your plan
          until the end of what you paid for.
        </p>
      </div>
      <div className="mt-12">
        <PlanCards mode="marketing" />
      </div>
      <p className="mt-10 text-center text-[12.5px] font-semibold text-[var(--text-faint)]">
        Prices in USD. Taxes are calculated at checkout for your country. Payments are processed
        by Dodo Payments, our merchant of record. Monthly plans aren&rsquo;t refundable; annual
        plans can be refunded, less the months used at the monthly price —{" "}
        <a href="/refunds" className="underline hover:text-[var(--text-muted)]">
          refund policy
        </a>
        .
      </p>
    </div>
  );
}
