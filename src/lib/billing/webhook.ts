import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { notifySubscriptionChange } from "@/lib/email/notify";
import {
  planForProduct,
  verifyDodoSignature,
  type DodoSubscription,
} from "./dodo";
import { recomputeWorkspacePlan } from "./resolve";
import {
  alreadyProcessed,
  capRejectedBody,
  traceInbound,
  updateTrace,
  type TraceStatus,
} from "./trace";

/**
 * Dodo webhook handling, separate from the HTTP route so it can be driven
 * directly by tests. See docs/BILLING.md.
 *
 * Order of operations, and why:
 *
 *   1. Verify the signature — pure, no I/O.
 *   2. Write the trace row. Every hit is recorded from here on, forged or not.
 *   3. Reject if unsigned. 401.
 *   4. Skip if this webhook-id was already processed. 200, marked duplicate.
 *   5. Match the workspace, apply, recompute the plan. 200.
 *   6. Anything that throws is recorded as failed and answered 500, so Dodo
 *      retries — a failure here is a customer who paid and has no plan.
 */

export type WebhookOutcome = { httpStatus: number; traceId: string; status: TraceStatus };

type Envelope = {
  business_id?: string;
  type?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

export async function handleDodoWebhook(
  rawBody: string,
  headers: Headers,
  nowSeconds?: number,
): Promise<WebhookOutcome> {
  const check = verifyDodoSignature(rawBody, headers, env.billing.dodo.webhookSecret, nowSeconds);
  const webhookId = headers.get("webhook-id");

  if (!check.ok) {
    const traceId = await traceInbound(webhookId, {
      status: "rejected",
      signatureValid: false,
      error: check.reason,
      payload: capRejectedBody(rawBody),
      // 503 when it is our configuration at fault, so Dodo keeps retrying until
      // it is fixed; 401 for a signature that simply doesn't match.
      httpStatus: env.billing.dodo.webhookSecret ? 401 : 503,
    });
    return { httpStatus: env.billing.dodo.webhookSecret ? 401 : 503, traceId, status: "rejected" };
  }

  let envelope: Envelope;
  try {
    envelope = JSON.parse(rawBody) as Envelope;
  } catch {
    const traceId = await traceInbound(webhookId, {
      status: "failed",
      signatureValid: true,
      error: "Signed, but the body is not valid JSON.",
      payload: capRejectedBody(rawBody),
      httpStatus: 400,
    });
    return { httpStatus: 400, traceId, status: "failed" };
  }

  const data = envelope.data ?? {};
  const type = envelope.type ?? null;
  const ids = extractIds(data);

  const traceId = await traceInbound(webhookId, {
    type,
    signatureValid: true,
    status: "received",
    providerCustomerId: ids.customerId,
    providerSubscriptionId: ids.subscriptionId,
    providerPaymentId: ids.paymentId,
    amount: ids.amount,
    currency: ids.currency,
    payload: envelope,
  });

  const finish = async (
    status: TraceStatus,
    httpStatus: number,
    extra: { workspaceId?: string | null; note?: string | null; error?: string | null } = {},
  ): Promise<WebhookOutcome> => {
    await updateTrace(traceId, { status, httpStatus, ...extra });
    return { httpStatus, traceId, status };
  };

  try {
    if (webhookId && (await alreadyProcessed(webhookId, traceId))) {
      return finish("duplicate", 200, { note: "This webhook-id was already processed." });
    }

    if (!type) return finish("ignored", 200, { note: "No event type." });

    const workspaceId = await workspaceFor(ids);

    if (type.startsWith("subscription.")) {
      if (!workspaceId) {
        return finish("unmatched", 200, {
          note: "No workspace has this customer. Not one of ours, or created outside the app.",
        });
      }
      const result = await applySubscription(
        workspaceId,
        data as unknown as DodoSubscription,
        envelope.timestamp ? new Date(envelope.timestamp) : new Date(),
      );
      if (result.kind === "unknown_product") {
        // Our customer, a product we can't map: a misconfiguration, and a
        // customer who may have paid without getting their plan. Fail loudly,
        // so Dodo retries and the fix takes effect when the env is corrected.
        return finish("failed", 500, {
          workspaceId,
          error: `Unknown product ${result.productId}. Set it in DODO_PRODUCT_* and Dodo's retry will apply it.`,
        });
      }
      if (result.kind === "stale") {
        return finish("ignored", 200, {
          workspaceId,
          note: "Older than the last event applied to this subscription, so not applied.",
        });
      }
      return finish("processed", 200, { workspaceId, note: result.note });
    }

    // Payments, refunds, disputes and dunning are recorded for the trace but
    // change nothing: the subscription events that accompany them carry the
    // state, and acting on both would apply every change twice.
    if (/^(payment|refund|dispute|dunning)\./.test(type)) {
      return finish(workspaceId ? "processed" : "unmatched", 200, {
        workspaceId,
        note: workspaceId ? "Recorded." : "No workspace has this customer.",
      });
    }

    return finish("ignored", 200, { workspaceId, note: "Event type we don't act on." });
  } catch (error) {
    console.error("[billing:webhook] processing failed", error);
    return finish("failed", 500, { error: (error as Error).message ?? "Unknown error" });
  }
}

// --- Matching ---------------------------------------------------------------

type Ids = {
  customerId: string | null;
  subscriptionId: string | null;
  paymentId: string | null;
  metadataWorkspaceId: string | null;
  amount: number | null;
  currency: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Pull identifiers out of any event's `data`, defensively — shapes differ by type. */
function extractIds(data: Record<string, unknown>): Ids {
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const amount = data.total_amount ?? data.amount;
  return {
    customerId: str(customer.customer_id) ?? str(data.customer_id),
    subscriptionId: str(data.subscription_id),
    paymentId: str(data.payment_id),
    metadataWorkspaceId: str(metadata.workspace_id),
    amount: typeof amount === "number" ? Math.round(amount) : null,
    currency: str(data.currency),
  };
}

/**
 * The workspace an event belongs to. Customer ID first — we create that
 * customer and store it, so it is the reliable key. Then a subscription we
 * already know. Checkout metadata last, and only if it names a real workspace.
 */
async function workspaceFor(ids: Ids): Promise<string | null> {
  if (ids.customerId) {
    const ws = await prisma.workspace.findUnique({
      where: { billingCustomerId: ids.customerId },
      select: { id: true },
    });
    if (ws) return ws.id;
  }
  if (ids.subscriptionId) {
    const sub = await prisma.subscription.findUnique({
      where: { providerSubscriptionId: ids.subscriptionId },
      select: { workspaceId: true },
    });
    if (sub) return sub.workspaceId;
  }
  if (ids.metadataWorkspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: ids.metadataWorkspaceId },
      select: { id: true },
    });
    if (ws) return ws.id;
  }
  return null;
}

// --- Applying a subscription ------------------------------------------------

function date(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ApplyResult =
  | { kind: "applied"; note: string }
  | { kind: "stale" }
  | { kind: "unknown_product"; productId: string };

/**
 * Store Dodo's view of a subscription and recompute the workspace's plan.
 * Used by the webhook and by the admin's "Resync from Dodo".
 *
 * `eventAt` guards ordering: an event older than the last one applied is not
 * applied, so a delayed retry can never roll a subscription backwards.
 */
export async function applySubscription(
  workspaceId: string,
  sub: DodoSubscription,
  eventAt: Date,
): Promise<ApplyResult> {
  const mapped = planForProduct(sub.product_id);
  if (!mapped) return { kind: "unknown_product", productId: sub.product_id };

  const existing = await prisma.subscription.findUnique({
    where: { providerSubscriptionId: sub.subscription_id },
    select: {
      lastEventAt: true,
      status: true,
      planKey: true,
      interval: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
    },
  });
  if (existing?.lastEventAt && eventAt < existing.lastEventAt) return { kind: "stale" };

  const fields = {
    workspaceId,
    providerCustomerId: sub.customer.customer_id,
    providerProductId: sub.product_id,
    planKey: mapped.plan,
    interval: mapped.interval,
    status: sub.status,
    currentPeriodStart: date(sub.previous_billing_date),
    currentPeriodEnd: date(sub.next_billing_date),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_next_billing_date),
    cancelledAt: date(sub.cancelled_at),
    graceEndsAt: date(sub.past_due_ends_at),
    lastEventAt: eventAt,
  };

  await prisma.subscription.upsert({
    where: { providerSubscriptionId: sub.subscription_id },
    create: { providerSubscriptionId: sub.subscription_id, ...fields },
    update: fields,
  });

  const change = await recomputeWorkspacePlan(workspaceId);

  // Judged on before/after, so the several events Dodo sends for one change —
  // and its retries — produce one email. Never allowed to fail the webhook.
  await notifySubscriptionChange(workspaceId, sub.subscription_id, existing, fields, eventAt).catch((error) =>
    console.error("[billing:webhook] subscription email failed", error),
  );
  const plan = change && change.before !== change.after
    ? `plan ${change.before} → ${change.after}`
    : `plan unchanged (${change?.after ?? "?"})`;
  return { kind: "applied", note: `${mapped.plan}/${mapped.interval} is ${sub.status}; ${plan}` };
}
