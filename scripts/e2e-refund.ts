/**
 * Refund policy checks, run from e2e-check.ts. See docs/BILLING.md §Refunds.
 *
 * The arithmetic is checked on its own; the rules that decide whether a refund
 * may happen at all are checked against a throwaway workspace; the calls to
 * Dodo are checked against a stubbed fetch, so no money moves anywhere.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import {
  addMonthsUtc,
  formatMinor,
  prepareAnnualRefund,
  quoteAnnualRefund,
} from "../src/lib/billing/refund";
import { cancelNow, createRefund } from "../src/lib/billing/dodo";
import { notifySubscriptionChange } from "../src/lib/email/notify";
import { render } from "../src/lib/email/templates";
import { setEmailTransport, type OutgoingEmail } from "../src/lib/email/send";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

type Mutable = { billing: { dodo: { apiKey: string } } };
const mutableEnv = env as unknown as Mutable;

const DAY = 24 * 60 * 60 * 1000;

export async function runRefundChecks(prisma: PrismaClient, check: Check, section: Section) {
  // --- Arithmetic -----------------------------------------------------------

  section("Refund policy: the arithmetic");

  const start = new Date("2026-03-15T12:00:00Z");
  const end = addMonthsUtc(start, 12);
  const q = (at: Date, paid = 19_000) => quoteAnnualRefund({ periodStart: start, periodEnd: end, paid, at });

  const first = q(new Date(start.getTime() + 60_000));
  check("on day one, the month in progress is used and eleven are refunded", first.ok && first.monthsUnused === 11);
  const policyExample = q(new Date("2026-05-25T00:00:00Z"));
  check(
    "the policy page's example holds: two months and ten days in refunds nine",
    policyExample.ok && policyExample.monthsUnused === 9 && policyExample.amount === 14_250,
  );
  const boundary = q(addMonthsUtc(start, 3));
  check("a month counts as used from the moment it starts", boundary.ok && boundary.monthsUsed === 4);
  const justBefore = q(new Date(addMonthsUtc(start, 3).getTime() - 1));
  check("…and not a millisecond before", justBefore.ok && justBefore.monthsUsed === 3);
  check("in the twelfth month there's nothing left to refund", !q(addMonthsUtc(start, 11)).ok);
  check("a request dated before the year began is refused", !q(new Date(start.getTime() - DAY)).ok);
  check("a request after the year ended is refused", !q(end).ok);
  check("nothing paid, nothing refunded", !q(new Date(start.getTime() + DAY), 0).ok);
  const odd = q(new Date(start.getTime() + DAY), 19_001);
  check("amounts round down to the minor unit", odd.ok && odd.amount === Math.floor((19_001 * 11) / 12));

  const jan31 = new Date("2026-01-31T00:00:00Z");
  check("month arithmetic clamps to the end of a short month", addMonthsUtc(jan31, 1).toISOString().startsWith("2026-02-28"));
  check("…and survives a leap year", addMonthsUtc(new Date("2028-01-31T00:00:00Z"), 1).toISOString().startsWith("2028-02-29"));
  check(
    "money is shown with each currency's own decimals",
    formatMinor(14_250, "usd") === "$142.50" && formatMinor(1_900, "JPY") === "¥1,900",
  );

  // --- The rules --------------------------------------------------------------

  section("Refund policy: who is eligible");

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e refund ${tag}`, slug: `e2e-refund-${tag}`, planKey: "pro" },
  });
  const periodStart = new Date(Date.now() - 40 * DAY);
  const yearly = await prisma.subscription.create({
    data: {
      workspaceId: workspace.id, providerSubscriptionId: `e2e_ry_${tag}`, providerCustomerId: `e2e_rc_${tag}`,
      providerProductId: `e2e_prod_${tag}`, planKey: "pro", interval: "year", status: "active",
      currentPeriodStart: periodStart, currentPeriodEnd: addMonthsUtc(periodStart, 12),
    },
  });
  const monthly = await prisma.subscription.create({
    data: {
      workspaceId: workspace.id, providerSubscriptionId: `e2e_rm_${tag}`, providerCustomerId: `e2e_rc_${tag}`,
      providerProductId: `e2e_prodm_${tag}`, planKey: "pro", interval: "month", status: "active",
      currentPeriodStart: periodStart, currentPeriodEnd: addMonthsUtc(periodStart, 1),
    },
  });
  const paymentId = `e2e_pay_${tag}`;

  try {
    const monthlyRefund = await prepareAnnualRefund(workspace.id, monthly.providerSubscriptionId, new Date());
    check("a monthly plan is never refundable", !monthlyRefund.ok);

    const noPayment = await prepareAnnualRefund(workspace.id, yearly.providerSubscriptionId, new Date());
    check("without a payment on record, staff are sent to Dodo's dashboard", !noPayment.ok && /Dodo/.test(noPayment.reason));

    const other = await prisma.workspace.create({ data: { name: `e2e other ${tag}`, slug: `e2e-other-${tag}` } });
    const foreign = await prepareAnnualRefund(other.id, yearly.providerSubscriptionId, new Date());
    check("a subscription can't be refunded through another customer", !foreign.ok);
    await prisma.workspace.delete({ where: { id: other.id } });

    await prisma.paymentEvent.create({
      data: {
        direction: "inbound", type: "payment.succeeded", status: "processed", workspaceId: workspace.id,
        providerSubscriptionId: yearly.providerSubscriptionId, providerPaymentId: paymentId,
        amount: 19_000, currency: "USD", receivedAt: new Date(periodStart.getTime() + 60_000),
      },
    });
    const ready = await prepareAnnualRefund(workspace.id, yearly.providerSubscriptionId, new Date());
    check(
      "an annual plan 40 days in refunds ten months of what was paid",
      ready.ok && ready.paymentId === paymentId && ready.monthsUnused === 10 && ready.amount === Math.floor((19_000 * 10) / 12),
      ready.ok ? `${ready.monthsUnused} months, ${ready.amount}` : ready.reason,
    );
    check("the refund targets the subscription's own product line", ready.ok && ready.productId === yearly.providerProductId);
    const dayOne = await prepareAnnualRefund(
      workspace.id,
      yearly.providerSubscriptionId,
      new Date(`${periodStart.toISOString().slice(0, 10)}T00:00:00Z`),
    );
    check("a request dated the day the year began counts as that year's first month", dayOne.ok && dayOne.monthsUnused === 11);

    // Refunded already in Dodo's dashboard: hands off.
    const dashboardRefund = await prisma.paymentEvent.create({
      data: { direction: "inbound", type: "refund.succeeded", status: "processed", providerPaymentId: paymentId, workspaceId: workspace.id },
    });
    const blocked = await prepareAnnualRefund(workspace.id, yearly.providerSubscriptionId, new Date());
    check("a payment already refunded elsewhere is left alone", !blocked.ok && /already/.test(blocked.reason));
    await prisma.paymentEvent.delete({ where: { id: dashboardRefund.id } });

    // Refunded by us, cancel still pending: a retry only finishes the cancel.
    await prisma.paymentEvent.create({
      data: {
        direction: "outbound", type: "refund.create", status: "ok", providerPaymentId: paymentId,
        providerSubscriptionId: yearly.providerSubscriptionId, workspaceId: workspace.id,
      },
    });
    const retry = await prepareAnnualRefund(workspace.id, yearly.providerSubscriptionId, new Date());
    check("after our own refund, a retry knows not to refund again", retry.ok && retry.refundAlreadyIssued);

    // --- Email --------------------------------------------------------------

    section("Refund policy: emails");

    const r = render("refund_issued", { name: "Alex", plan: "Pro", amount: "$158.33", months: 10 });
    check("the refund email names the amount and the months", r.subject.includes("$158.33") && r.text.includes("10 unused months"));
    check("it comes from the billing address", r.category === "billing");
    check(
      "the renewal reminder tells yearly customers a refund is possible",
      render("renewal_reminder", { name: "Alex", plan: "Pro", renewsOn: "1 May 2027" }).text.includes("refunded"),
    );

    const sent: OutgoingEmail[] = [];
    setEmailTransport(async (e) => {
      sent.push(e);
      return { messageId: "t" };
    });
    const owner = await prisma.user.create({ data: { email: `e2e-refund-${tag}@example.com`, passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: owner.id, workspaceId: workspace.id, role: "owner" } });
    const snap = (status: string) => ({
      status, planKey: "pro", interval: "year", cancelAtPeriodEnd: false,
      currentPeriodEnd: yearly.currentPeriodEnd, graceEndsAt: null,
    });
    await notifySubscriptionChange(workspace.id, yearly.providerSubscriptionId, snap("active"), snap("cancelled"), new Date());
    const queued = await prisma.emailMessage.count({ where: { workspaceId: workspace.id, template: "subscription_ended" } });
    check("a plan ended by our refund doesn't also get the 'plan has ended' email", queued === 0 && sent.length === 0);
    await notifySubscriptionChange(workspace.id, monthly.providerSubscriptionId, snap("active"), snap("cancelled"), new Date());
    const other2 = await prisma.emailMessage.count({ where: { workspaceId: workspace.id, template: "subscription_ended" } });
    check("…but any other ending still does", other2 === 1);
    setEmailTransport(null);
    await prisma.emailMessage.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.user.delete({ where: { id: owner.id } });

    // --- Dodo requests ------------------------------------------------------

    section("Refund policy: what we send Dodo");

    const savedKey = mutableEnv.billing.dodo.apiKey;
    const realFetch = globalThis.fetch;
    const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
    mutableEnv.billing.dodo.apiKey = "test_key";
    globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ refund_id: "ref_1", status: "pending" }), { status: 200 });
    }) as typeof fetch;
    try {
      await createRefund({ paymentId: "pay_1", productId: "prod_1", amount: 15_833, reason: "test" });
      await cancelNow("sub_1", "test");
    } finally {
      globalThis.fetch = realFetch;
      mutableEnv.billing.dodo.apiKey = savedKey;
    }
    const [refundCall, cancelCall] = calls;
    const item = (refundCall?.body.items as { item_id: string; amount: number; tax_inclusive: boolean }[] | undefined)?.[0];
    check(
      "a refund is a partial refund of one product line, tax included",
      refundCall?.method === "POST" && new URL(refundCall.url).pathname.endsWith("/refunds") &&
        refundCall.body.payment_id === "pay_1" && item?.item_id === "prod_1" && item.amount === 15_833 && item.tax_inclusive === true,
    );
    check(
      "the plan is ended now, not at period end",
      cancelCall?.method === "PATCH" && new URL(cancelCall.url).pathname.endsWith("/subscriptions/sub_1") &&
        cancelCall.body.status === "cancelled" && cancelCall.body.cancel_at_next_billing_date === undefined,
    );
  } finally {
    await prisma.paymentEvent.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
}
