/**
 * Billing checks, run from e2e-check.ts. See docs/BILLING.md.
 *
 * Everything here runs against a throwaway workspace created for the purpose,
 * and every change to runtime configuration is undone in a `finally`, so a
 * failing check can't leak state into the rest of the suite.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { encrypt } from "../src/lib/crypto";
import { errorResponse } from "../src/lib/api";
import { PlanLimitError, featureForNode, getLimits, hasFeature, isWithinLimit, requireFeature } from "../src/lib/plan";
import { NODE_FEATURE, PLANS } from "../src/lib/billing/plans";
import { resolvePlanKey, recomputeWorkspacePlan, reconcilePlans } from "../src/lib/billing/resolve";
import { getUsage, periodKey, releaseUsage, reserveUsage } from "../src/lib/billing/usage";
import { signDodoPayload } from "../src/lib/billing/dodo";
import { handleDodoWebhook } from "../src/lib/billing/webhook";
import { purgeRejectedPaymentEvents } from "../src/lib/billing/trace";
import { dispatch } from "../src/lib/engine/dispatch";
import { claimCommentReply } from "../src/lib/engine/guards";
import { startFlowRun } from "../src/lib/engine/run";
import { generateAiReply } from "../src/lib/ai/agent";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

// Runtime configuration is mutated for the duration of these checks. `env` is
// declared `as const` for application code; tests reach past that on purpose.
type Mutable = {
  billing: {
    enabled: boolean;
    dodo: {
      webhookSecret: string;
      products: { pro: { month: string; year: string }; business: { month: string; year: string } };
    };
  };
  anthropicApiKey: string;
  meta: { appId: string; appSecret: string };
};
const mutableEnv = env as unknown as Mutable;

const NODE_TYPES = [
  "AI_REPLY", "ASK_FOR_FOLLOW", "COLLECT_INPUT", "CONDITION", "DELAY", "END",
  "FOLLOWER_CHECK", "HTTP_REQUEST", "HUMAN_HANDOFF", "RANDOMIZER", "REPLY_TO_COMMENT",
  "SEND_COUPON", "SEND_MESSAGE", "SET_FIELD", "TAG", "TRIGGER",
];

export async function runBillingChecks(prisma: PrismaClient, check: Check, section: Section) {
  const saved = {
    enabled: mutableEnv.billing.enabled,
    secret: mutableEnv.billing.dodo.webhookSecret,
    products: JSON.parse(JSON.stringify(mutableEnv.billing.dodo.products)),
    anthropic: mutableEnv.anthropicApiKey,
    metaAppId: mutableEnv.meta.appId,
    metaAppSecret: mutableEnv.meta.appSecret,
  };

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e billing ${tag}`, slug: `e2e-billing-${tag}`, planKey: "free" },
  });
  const account = await prisma.instagramAccount.create({
    data: {
      workspaceId: workspace.id,
      igUserId: `e2e_bill_ig_${tag}`,
      username: `e2e_bill_${tag}`,
      status: "demo",
    },
  });
  const contact = await prisma.contact.create({
    data: {
      accountId: account.id,
      igsid: `e2e_bill_contact_${tag}`,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInteractionAt: new Date(),
    },
  });

  const setPlan = (planKey: string) =>
    prisma.workspace.update({ where: { id: workspace.id }, data: { planKey } });
  const setUsage = (metric: string, count: number) =>
    prisma.usageCounter.upsert({
      where: { workspaceId_period_metric: { workspaceId: workspace.id, period: periodKey(), metric } },
      create: { workspaceId: workspace.id, period: periodKey(), metric, count },
      update: { count },
    });

  try {
    // --- The seam -----------------------------------------------------------

    section("Plans and the plan seam");

    mutableEnv.billing.enabled = false;
    check("billing off: a Free workspace is treated as unlimited", getLimits({ planKey: "free" }).dmsPerMonth === Infinity);
    check("billing off: every feature is available", hasFeature({ planKey: "free" }, "apiAccess"));

    mutableEnv.billing.enabled = true;
    const free = getLimits({ planKey: "free" });
    check(
      "billing on: Free is 1 account, 1,000 DMs, no AI",
      free.instagramAccounts === 1 && free.dmsPerMonth === 1_000 && free.aiRepliesPerMonth === 0,
    );
    check(
      "Pro has broadcasts but not the public API",
      hasFeature({ planKey: "pro" }, "broadcasts") && !hasFeature({ planKey: "pro" }, "apiAccess"),
    );
    check(
      "Business has every feature",
      [...PLANS.unlimited.features].every((f) => hasFeature({ planKey: "business" }, f)),
    );
    check("an unknown plan key fails closed to Free", getLimits({ planKey: "platinum" }).dmsPerMonth === 1_000);
    check(
      "every gated node type exists in the flow schema",
      Object.keys(NODE_FEATURE).every((t) => NODE_TYPES.includes(t)),
      Object.keys(NODE_FEATURE).filter((t) => !NODE_TYPES.includes(t)).join(", "),
    );
    check(
      "core nodes are never gated — including human handoff",
      ["TRIGGER", "SEND_MESSAGE", "REPLY_TO_COMMENT", "HUMAN_HANDOFF", "FOLLOWER_CHECK", "ASK_FOR_FOLLOW", "TAG", "END"].every(
        (t) => featureForNode(t) === null,
      ),
    );

    let thrown: unknown = null;
    try {
      requireFeature({ planKey: "free" }, "broadcasts");
    } catch (error) {
      thrown = error;
    }
    check(
      "a gated action throws a 402 naming the plan that unlocks it",
      thrown instanceof PlanLimitError && thrown.status === 402 && thrown.upgradeTo === "pro",
    );
    check("the API layer answers that with HTTP 402", errorResponse(thrown).status === 402);

    // --- Resolution ---------------------------------------------------------

    section("Plan resolution");

    const now = new Date();
    const future = new Date(now.getTime() + 86_400_000);
    const past = new Date(now.getTime() - 86_400_000);
    const none = { plan: null, until: null };
    const r = (override: { plan: string | null; until: Date | null }, subscriptions: Array<{ planKey: string; status: string; currentPeriodEnd: Date | null }>) =>
      resolvePlanKey({ override, subscriptions, now });

    check("nothing at all resolves to Free", r(none, []) === "free");
    check("an active subscription grants its plan", r(none, [{ planKey: "pro", status: "active", currentPeriodEnd: future }]) === "pro");
    check("past_due keeps the plan through Dodo's grace window", r(none, [{ planKey: "pro", status: "past_due", currentPeriodEnd: future }]) === "pro");
    check("on_hold drops to Free", r(none, [{ planKey: "pro", status: "on_hold", currentPeriodEnd: future }]) === "free");
    check(
      "cancelled drops to Free even with time left — paid-through stays `active` in Dodo",
      r(none, [{ planKey: "pro", status: "cancelled", currentPeriodEnd: future }]) === "free",
    );
    check("an unknown status fails closed", r(none, [{ planKey: "pro", status: "mystery", currentPeriodEnd: future }]) === "free");
    check("an unknown plan key on a subscription fails closed", r(none, [{ planKey: "gold", status: "active", currentPeriodEnd: future }]) === "free");
    check("an override grants a plan", r({ plan: "unlimited", until: null }, []) === "unlimited");
    check(
      "an override can never lower what a customer pays for",
      r({ plan: "free", until: null }, [{ planKey: "business", status: "active", currentPeriodEnd: future }]) === "business",
    );
    check("an expired override is ignored", r({ plan: "business", until: past }, []) === "free");
    check(
      "the best of several subscriptions wins",
      r(none, [
        { planKey: "pro", status: "active", currentPeriodEnd: future },
        { planKey: "business", status: "active", currentPeriodEnd: future },
      ]) === "business",
    );
    check(
      "a lapsed subscription doesn't outweigh a live one",
      r(none, [
        { planKey: "pro", status: "active", currentPeriodEnd: future },
        { planKey: "business", status: "on_hold", currentPeriodEnd: future },
      ]) === "pro",
    );

    // --- Metering -----------------------------------------------------------

    section("Metering");

    check("the period key is the UTC month", /^\d{4}-\d{2}$/.test(periodKey()) && periodKey(new Date("2026-01-31T23:59:59Z")) === "2026-01");

    await setPlan("free");
    await setUsage("dms", 995);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveUsage({ id: workspace.id, planKey: "free" }, "dms")),
    );
    const granted = results.filter(Boolean).length;
    const after = (await getUsage(workspace.id)).dms;
    check(
      "20 concurrent reservations at 995/1000 grant exactly 5 — never over the limit",
      granted === 5 && after === 1_000,
      `granted ${granted}, count ${after}`,
    );

    await releaseUsage(workspace.id, "dms");
    check("releasing gives one back", (await getUsage(workspace.id)).dms === 999);

    await setUsage("dms", 0);
    await releaseUsage(workspace.id, "dms");
    check("a release never takes the count below zero", (await getUsage(workspace.id)).dms === 0);

    const unl = await reserveUsage({ id: workspace.id, planKey: "unlimited" }, "dms");
    check("an unlimited plan always reserves, and is still counted", unl && (await getUsage(workspace.id)).dms === 1);

    // --- Enforcement --------------------------------------------------------

    section("Plan enforcement");

    await setPlan("free");
    await setUsage("dms", 0);
    const simulated = await dispatch({
      accountId: account.id,
      contactId: contact.id,
      target: { to: "user", igsid: contact.igsid },
      message: { kind: "text", text: "e2e billing" },
      source: "automation",
    });
    check(
      "a simulated send never spends a customer's quota",
      simulated.status === "sent" && (await getUsage(workspace.id)).dms === 0,
    );

    // A live-looking account, so the send reaches the quota gate. The gate
    // refuses BEFORE any network call is made, which is what's asserted.
    //
    // Instagram must count as configured, or dispatch takes the simulated path
    // and never reaches the gate — which is exactly how this passed locally and
    // failed in CI, where no Meta credentials are set. The test sets what it
    // depends on rather than inheriting it.
    mutableEnv.meta.appId = "e2e-app-id";
    mutableEnv.meta.appSecret = "e2e-app-secret";
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { status: "connected", accessTokenEnc: encrypt("e2e-not-a-real-token") },
    });
    await setUsage("dms", 1_000);
    const commentId = `e2e_bill_comment_${tag}`;
    const capped = await dispatch({
      accountId: account.id,
      contactId: contact.id,
      target: { to: "comment", commentId },
      message: { kind: "text", text: "e2e billing" },
      source: "automation",
      commentAt: new Date(),
    });
    check(
      "an automated send past the monthly allowance is skipped as PLAN_LIMIT",
      capped.status === "skipped" && capped.reason === "PLAN_LIMIT",
    );
    // Only meaningful if the send really reached the quota gate: the simulated
    // path releases the claim too, so without the check above this would pass
    // for the wrong reason.
    check(
      "that skip hands the comment's one private reply back",
      capped.status === "skipped" && capped.reason === "PLAN_LIMIT" &&
        (await claimCommentReply(account.id, commentId, "private")),
    );
    mutableEnv.meta.appId = saved.metaAppId;
    mutableEnv.meta.appSecret = saved.metaAppSecret;
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { status: "demo", accessTokenEnc: null },
    });

    // AI: a configured model, a plan with no AI allowance. The reservation
    // fails before the model is called, so no network request is made.
    mutableEnv.anthropicApiKey = "e2e-not-a-real-key";
    await setUsage("ai_replies", 0);
    // The simulated send above already opened this contact's conversation.
    const conversation = await prisma.conversation.upsert({
      where: { accountId_contactId: { accountId: account.id, contactId: contact.id } },
      create: { accountId: account.id, contactId: contact.id },
      update: {},
    });
    const ai = await generateAiReply({
      workspaceId: workspace.id,
      contact,
      conversationId: conversation.id,
    });
    check(
      "no AI allowance: the reply falls back, and nothing is counted",
      ai.answered === false && ai.text.length > 0 && (await getUsage(workspace.id)).ai_replies === 0,
    );
    mutableEnv.anthropicApiKey = saved.anthropic;

    // The executor: a flow with a DELAY step, on a plan without advanced flows.
    const automation = await prisma.automation.create({
      data: {
        accountId: account.id,
        name: `e2e billing gate ${tag}`,
        triggerType: "DM_KEYWORD",
        enabled: true,
        flow: {
          create: {
            name: "e2e billing gate",
            nodes: [
              { id: "t", type: "TRIGGER", position: { x: 0, y: 0 }, data: { label: "Start" } },
              { id: "d", type: "DELAY", position: { x: 0, y: 160 }, data: { label: "Wait", minutes: 30 } },
              { id: "e", type: "END", position: { x: 0, y: 320 }, data: { label: "Done" } },
            ],
            edges: [
              { id: "e1", source: "t", target: "d", sourceHandle: "next" },
              { id: "e2", source: "d", target: "e", sourceHandle: "next" },
            ],
          },
        },
      },
    });
    const event = {
      dedupeKey: `e2e_bill_evt_${tag}`,
      igUserId: account.igUserId,
      kind: "DM_KEYWORD" as const,
      igsid: contact.igsid,
      text: "hello",
      timestamp: new Date(),
      raw: {},
    };

    await setPlan("free");
    const gated = await startFlowRun({ automationId: automation.id, accountId: account.id, contactId: contact.id, event });
    check(
      "a downgraded flow halts at the first step the plan doesn't cover",
      gated?.status === "halted" && (gated.haltReason ?? "").includes("Advanced flows"),
      `${gated?.status}: ${gated?.haltReason}`,
    );
    const delayStep = await prisma.flowRunStep.findFirst({ where: { flowRunId: gated!.id, nodeId: "d" } });
    check("and the gated step is recorded as skipped, not failed", delayStep?.status === "skipped");

    await setPlan("pro");
    const allowed = await startFlowRun({
      automationId: automation.id,
      accountId: account.id,
      contactId: contact.id,
      event: { ...event, dedupeKey: `${event.dedupeKey}_2` },
    });
    check("the same flow on Pro is not stopped by the plan", allowed?.status === "waiting");

    check("Free is at its account cap with one account", !isWithinLimit({ planKey: "free" }, "instagramAccounts", 1));
    check("Pro has room for a second", isWithinLimit({ planKey: "pro" }, "instagramAccounts", 1));

    // --- Dodo webhooks ------------------------------------------------------

    section("Dodo webhooks and the payment trace");

    const secret = "whsec_" + randomBytes(24).toString("base64");
    mutableEnv.billing.dodo.webhookSecret = secret;
    mutableEnv.billing.dodo.products.pro.month = `prod_e2e_pro_m_${tag}`;
    mutableEnv.billing.dodo.products.pro.year = `prod_e2e_pro_y_${tag}`;
    mutableEnv.billing.dodo.products.business.month = `prod_e2e_biz_m_${tag}`;
    mutableEnv.billing.dodo.products.business.year = `prod_e2e_biz_y_${tag}`;

    const customerId = `cus_e2e_${tag}`;
    await prisma.workspace.update({ where: { id: workspace.id }, data: { billingCustomerId: customerId, planKey: "free" } });

    const subId = `sub_e2e_${tag}`;
    const send = async (
      payload: unknown,
      opts: { id?: string; ts?: number; badSig?: boolean; raw?: string } = {},
    ) => {
      const raw = opts.raw ?? JSON.stringify(payload);
      const id = opts.id ?? `msg_${randomBytes(6).toString("hex")}`;
      const ts = opts.ts ?? Math.floor(Date.now() / 1000);
      const signature = opts.badSig ? "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" : signDodoPayload(raw, id, ts, secret);
      const headers = new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": signature });
      return handleDodoWebhook(raw, headers);
    };
    const subEvent = (type: string, status: string, productId: string, at = new Date()) => ({
      business_id: "bus_e2e",
      type,
      timestamp: at.toISOString(),
      data: {
        subscription_id: subId,
        status,
        product_id: productId,
        customer: { customer_id: customerId, email: "e2e@example.com", name: "E2E" },
        previous_billing_date: new Date().toISOString(),
        next_billing_date: future.toISOString(),
        cancel_at_next_billing_date: false,
        metadata: {},
      },
    });
    const traceRows = () => prisma.paymentEvent.count({ where: { OR: [{ workspaceId: workspace.id }, { providerCustomerId: customerId }] } });
    const planNow = async () => (await prisma.workspace.findUnique({ where: { id: workspace.id } }))!.planKey;

    const rowsBefore = await prisma.paymentEvent.count();
    const activeId = `msg_active_${tag}`;
    const t0 = new Date(Date.now() - 60_000);
    const first = await send(subEvent("subscription.active", "active", `prod_e2e_pro_m_${tag}`, t0), { id: activeId });
    check("a signed subscription.active is processed and answered 200", first.httpStatus === 200 && first.status === "processed");
    check("the workspace moves to Pro", (await planNow()) === "pro");
    const sub = await prisma.subscription.findUnique({ where: { providerSubscriptionId: subId } });
    check("the subscription is stored with its plan and interval", sub?.planKey === "pro" && sub.interval === "month" && sub.status === "active");

    const replay = await send(subEvent("subscription.active", "active", `prod_e2e_pro_m_${tag}`, t0), { id: activeId });
    check("a replay of the same webhook-id is a duplicate, answered 200", replay.httpStatus === 200 && replay.status === "duplicate");

    const forged = await send(subEvent("subscription.active", "active", `prod_e2e_biz_m_${tag}`), { badSig: true });
    check("a bad signature is rejected with 401", forged.httpStatus === 401 && forged.status === "rejected");
    check("and grants nothing", (await planNow()) === "pro");
    const forgedRow = await prisma.paymentEvent.findUnique({ where: { id: forged.traceId } });
    check("but it is still recorded, marked unsigned", forgedRow?.signatureValid === false);

    const huge = await send(null, { badSig: true, raw: "x".repeat(40_000) });
    const hugeRow = await prisma.paymentEvent.findUnique({ where: { id: huge.traceId } });
    check(
      "an oversized unsigned body is capped before it is stored",
      JSON.stringify(hugeRow?.payload ?? "").length < 9 * 1024,
    );

    const stale = await send(subEvent("subscription.on_hold", "on_hold", `prod_e2e_pro_m_${tag}`, new Date(t0.getTime() - 3_600_000)));
    check("an event older than the last one applied is not applied", stale.status === "ignored" && (await planNow()) === "pro");

    const held = await send(subEvent("subscription.on_hold", "on_hold", `prod_e2e_pro_m_${tag}`));
    check("on_hold moves the workspace to Free", held.status === "processed" && (await planNow()) === "free");

    const unknown = await send(subEvent("subscription.active", "active", "prod_somebody_elses"));
    check(
      "our customer on an unmapped product fails loudly with 500, so Dodo retries",
      unknown.httpStatus === 500 && unknown.status === "failed",
    );

    const stranger = await send({
      type: "subscription.active",
      timestamp: new Date().toISOString(),
      data: { subscription_id: "sub_stranger", status: "active", product_id: "x", customer: { customer_id: "cus_nobody" } },
    });
    check("an event for a customer we don't have is recorded as unmatched", stranger.httpStatus === 200 && stranger.status === "unmatched");

    const paid = await send({
      type: "payment.succeeded",
      timestamp: new Date().toISOString(),
      data: { payment_id: `pay_${tag}`, subscription_id: subId, total_amount: 1900, currency: "USD", customer: { customer_id: customerId } },
    });
    const paidRow = await prisma.paymentEvent.findUnique({ where: { id: paid.traceId } });
    check(
      "a payment is recorded with its amount and matched to the customer",
      paid.status === "processed" && paidRow?.amount === 1900 && paidRow.workspaceId === workspace.id,
    );

    const garbled = await send(null, { raw: "{not json" });
    check("a signed body that isn't JSON is answered 400", garbled.httpStatus === 400 && garbled.status === "failed");

    const rowsAfter = await prisma.paymentEvent.count();
    // Ten hits were sent between the two counts, every one of them different:
    // valid, replay, forged, oversized, stale, on_hold, unmapped product,
    // stranger, payment, garbled.
    check(
      "every hit produced exactly one trace row",
      rowsAfter - rowsBefore === 10,
      `expected 10, got ${rowsAfter - rowsBefore}`,
    );
    // Six of those carry our customer's ID. Forged, oversized and garbled bodies
    // are never parsed, and the stranger belongs to someone else.
    check("the customer's own trail holds exactly their hits", (await traceRows()) === 6, `got ${await traceRows()}`);

    mutableEnv.billing.dodo.webhookSecret = "";
    const unconfigured = await send(subEvent("subscription.active", "active", `prod_e2e_pro_m_${tag}`));
    check(
      "with no secret configured, hits are rejected with 503 so Dodo keeps retrying",
      unconfigured.httpStatus === 503 && unconfigured.status === "rejected",
    );
    mutableEnv.billing.dodo.webhookSecret = secret;

    await prisma.paymentEvent.update({ where: { id: forged.traceId }, data: { receivedAt: new Date(Date.now() - 40 * 86_400_000) } });
    await prisma.paymentEvent.update({ where: { id: first.traceId }, data: { receivedAt: new Date(Date.now() - 40 * 86_400_000) } });
    await purgeRejectedPaymentEvents();
    check(
      "old rejected hits are purged; the financial record is kept",
      !(await prisma.paymentEvent.findUnique({ where: { id: forged.traceId } })) &&
        Boolean(await prisma.paymentEvent.findUnique({ where: { id: first.traceId } })),
    );

    // --- Overrides ----------------------------------------------------------

    section("Admin plan overrides");

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { planOverride: "business", planOverrideReason: "e2e comp", planOverrideUntil: future },
    });
    await recomputeWorkspacePlan(workspace.id);
    check("an override takes effect when recomputed", (await planNow()) === "business");

    await prisma.workspace.update({ where: { id: workspace.id }, data: { planOverrideUntil: past } });
    await reconcilePlans();
    const reconciled = await prisma.workspace.findUnique({ where: { id: workspace.id } });
    check(
      "the reconcile job clears an expired override and recomputes the plan",
      reconciled?.planOverride === null && reconciled.planKey === "free",
    );
  } finally {
    mutableEnv.billing.enabled = saved.enabled;
    mutableEnv.billing.dodo.webhookSecret = saved.secret;
    Object.assign(mutableEnv.billing.dodo.products, saved.products);
    mutableEnv.anthropicApiKey = saved.anthropic;
    mutableEnv.meta.appId = saved.metaAppId;
    mutableEnv.meta.appSecret = saved.metaAppSecret;
    await prisma.paymentEvent.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => undefined);
    await prisma.paymentEvent
      .deleteMany({ where: { OR: [{ providerCustomerId: { in: [`cus_e2e_${tag}`, "cus_nobody"] } }, { providerSubscriptionId: { startsWith: "sub_e2e_" } }] } })
      .catch(() => undefined);
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
}
