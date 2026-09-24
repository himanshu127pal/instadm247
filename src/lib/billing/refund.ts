import { prisma } from "@/lib/db";
import { planFor } from "./plans";

/**
 * The refund policy, as code. See /refunds and docs/BILLING.md §Refunds.
 *
 *   Monthly plans — no refunds.
 *   Annual plans  — on request: what was paid, minus the months used charged
 *                   at the MONTHLY price. The month in progress counts as
 *                   used. Charging used months at the annual rate would let
 *                   someone buy a year, use a few months at the discount and
 *                   take the rest back.
 *
 * Kept free of I/O apart from `findRefundablePayment`, so the arithmetic that
 * decides how much money goes back is testable on its own.
 */

export const MONTHS_PER_YEAR = 12;

/** `start` plus `n` calendar months, UTC, clamped: 31 Jan + 1 month = 28/29 Feb. */
export function addMonthsUtc(start: Date, n: number): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

export type RefundQuote =
  | {
      ok: true;
      monthsUsed: number;
      monthsUnused: number;
      /** Minor units, same currency as the payment. Rounded down. */
      amount: number;
    }
  | { ok: false; reason: string };

/**
 * How much of an annual payment goes back if the request arrived at `at`.
 *
 *   refund = paid × (yearly price − months used × monthly price) ÷ yearly price
 *
 * Worked in list prices and then applied as a share of what was actually
 * paid, so it holds whatever currency they paid in and whatever tax was added:
 * in list terms it is simply "the yearly price minus the months used at the
 * monthly price". A month counts as used once it has started. Once the used
 * months cost as much as the year did, nothing is left.
 */
export function quoteAnnualRefund(input: {
  periodStart: Date;
  periodEnd: Date;
  /** What the customer paid for this year, tax included, in minor units. */
  paid: number;
  /** List prices, in whole units of the list currency. */
  price: { month: number; year: number };
  at: Date;
}): RefundQuote {
  const { periodStart, periodEnd, paid, price, at } = input;
  if (!(price.year > 0) || !(price.month > 0)) return { ok: false, reason: "This plan has no list price to work from." };
  if (!(paid > 0)) return { ok: false, reason: "There's no payment to refund." };
  if (at < periodStart) return { ok: false, reason: "The request is dated before this billing year began." };
  if (at >= periodEnd) return { ok: false, reason: "This billing year has already ended." };

  let monthsUsed = 0;
  while (monthsUsed < MONTHS_PER_YEAR && addMonthsUtc(periodStart, monthsUsed) <= at) monthsUsed++;

  const monthsUnused = MONTHS_PER_YEAR - monthsUsed;
  const remaining = price.year - monthsUsed * price.month;
  if (remaining <= 0) {
    return {
      ok: false,
      reason: `${monthsUsed} ${monthsUsed === 1 ? "month" : "months"} at the monthly price already cost as much as the year, so nothing is left to refund.`,
    };
  }

  return { ok: true, monthsUsed, monthsUnused, amount: Math.floor((paid * remaining) / price.year) };
}

/**
 * The payment that bought the subscription's current year, from the webhook
 * trace. Dodo's payment.succeeded for a renewal lands around the period start,
 * so anything a few days either side of it counts.
 */
export async function findRefundablePayment(sub: {
  providerSubscriptionId: string;
  currentPeriodStart: Date | null;
}): Promise<{ paymentId: string; amount: number; currency: string | null } | null> {
  if (!sub.currentPeriodStart) return null;
  const slack = 3 * 24 * 60 * 60 * 1000;
  const payment = await prisma.paymentEvent.findFirst({
    where: {
      direction: "inbound",
      type: "payment.succeeded",
      status: "processed",
      providerSubscriptionId: sub.providerSubscriptionId,
      providerPaymentId: { not: null },
      amount: { gt: 0 },
      receivedAt: { gte: new Date(sub.currentPeriodStart.getTime() - slack) },
    },
    orderBy: { receivedAt: "desc" },
    select: { providerPaymentId: true, amount: true, currency: true },
  });
  if (!payment?.providerPaymentId || !payment.amount) return null;
  return { paymentId: payment.providerPaymentId, amount: payment.amount, currency: payment.currency };
}

/** Has this payment already been refunded, by us or in Dodo's dashboard? */
export async function alreadyRefunded(paymentId: string): Promise<boolean> {
  const hit = await prisma.paymentEvent.findFirst({
    where: {
      providerPaymentId: paymentId,
      OR: [
        { direction: "outbound", type: "refund.create", status: "ok" },
        { direction: "inbound", type: { startsWith: "refund." }, NOT: { type: "refund.failed" } },
      ],
    },
    select: { id: true },
  });
  return Boolean(hit);
}

/**
 * Money for people: (19000, "USD") → "US$190.00", (1900, "JPY") → "¥1,900".
 * Dodo reports amounts in the currency's smallest unit, and not every currency
 * has two decimals, so the exponent comes from the currency itself.
 */
export function formatMinor(amount: number, currency: string | null): string {
  if (!currency) return String(amount);
  try {
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() });
    const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    return fmt.format(amount / 10 ** digits);
  } catch {
    return `${currency.toUpperCase()} ${amount}`;
  }
}

export type PreparedRefund =
  | {
      ok: true;
      paymentId: string;
      productId: string;
      planKey: string;
      paid: number;
      currency: string | null;
      monthsUsed: number;
      monthsUnused: number;
      amount: number;
      /** A refund we issued earlier for this payment — the cancel is what's left. */
      refundAlreadyIssued: boolean;
    }
  | { ok: false; reason: string };

/**
 * Everything staff need to decide an annual refund, worked out from our own
 * records: which payment, what was paid, how many months are left, how much
 * goes back. Used for both the preview and the refund itself, so the two
 * can't disagree.
 */
export async function prepareAnnualRefund(
  workspaceId: string,
  subscriptionId: string,
  requestedAt: Date,
): Promise<PreparedRefund> {
  const sub = await prisma.subscription.findFirst({
    where: { providerSubscriptionId: subscriptionId, workspaceId },
  });
  if (!sub) return { ok: false, reason: "That subscription doesn't belong to this customer." };
  if (sub.interval !== "year") return { ok: false, reason: "Monthly plans aren't refundable under the policy." };
  if (sub.status !== "active") return { ok: false, reason: `The subscription is ${sub.status}, not active.` };
  if (!sub.currentPeriodStart || !sub.currentPeriodEnd) {
    return { ok: false, reason: "The billing year's dates aren't known yet — resync the subscription first." };
  }

  const payment = await findRefundablePayment(sub);
  if (!payment) {
    return {
      ok: false,
      reason: "No payment for this billing year is on record. Handle this one from Dodo's dashboard.",
    };
  }

  const ours = await prisma.paymentEvent.findFirst({
    where: { providerPaymentId: payment.paymentId, direction: "outbound", type: "refund.create", status: "ok" },
    select: { id: true },
  });
  if (!ours && (await alreadyRefunded(payment.paymentId))) {
    return {
      ok: false,
      reason: "This payment already has a refund recorded. Check it in Dodo's dashboard before doing anything else.",
    };
  }

  // Staff give the request as a date, taken as the start of that UTC day. On
  // the day the year began that's a few hours before it did, and the request
  // is plainly about this year, not the one that just ended.
  const sameDay = requestedAt.toISOString().slice(0, 10) === sub.currentPeriodStart.toISOString().slice(0, 10);
  const at = sameDay && requestedAt < sub.currentPeriodStart ? sub.currentPeriodStart : requestedAt;

  const quote = quoteAnnualRefund({
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    paid: payment.amount,
    price: planFor(sub.planKey).price ?? { month: 0, year: 0 },
    at,
  });
  if (!quote.ok) return quote;

  return {
    ok: true,
    paymentId: payment.paymentId,
    productId: sub.providerProductId,
    planKey: sub.planKey,
    paid: payment.amount,
    currency: payment.currency,
    monthsUsed: quote.monthsUsed,
    monthsUnused: quote.monthsUnused,
    amount: quote.amount,
    refundAlreadyIssued: Boolean(ours),
  };
}
