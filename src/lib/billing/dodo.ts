import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { BillingInterval, PurchasablePlan } from "./plans";
import { traceOutbound } from "./trace";

/**
 * Everything Dodo-specific lives in this file and the webhook route. The rest of
 * billing — plans, metering, plan resolution, the trace — knows nothing about
 * the provider, so replacing Dodo means rewriting these two files.
 *
 * Every endpoint and field here was verified against Dodo's official SDK
 * source; see docs/BILLING.md §Dodo Payments — verified API reference.
 */

export class DodoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DodoError";
  }
}

async function dodo<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: { body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const { apiKey, baseUrl } = env.billing.dodo;
  if (!apiKey) throw new DodoError("Billing is not configured.", 503);

  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const message =
      (json as { message?: string; error?: string }).message ??
      (json as { error?: string }).error ??
      `Dodo returned ${res.status}`;
    throw new DodoError(message, res.status);
  }
  return json as T;
}

// --- Products ---------------------------------------------------------------

export function productFor(plan: PurchasablePlan, interval: BillingInterval): string {
  return env.billing.dodo.products[plan][interval];
}

/**
 * Map a Dodo product back to our plan. Returns null for a product we don't know
 * — which the webhook records as a failure rather than guessing, because a
 * guess here is a customer billed for one plan and given another.
 */
export function planForProduct(
  productId: string,
): { plan: PurchasablePlan; interval: BillingInterval } | null {
  const { products } = env.billing.dodo;
  for (const plan of ["pro", "business"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (products[plan][interval] && products[plan][interval] === productId) {
        return { plan, interval };
      }
    }
  }
  return null;
}

// --- Customers, checkout, portal --------------------------------------------

/**
 * Dodo's customer for a workspace, created on first use and stored. Webhooks
 * are mapped back to the workspace through this ID, which is why it is created
 * by us before checkout rather than left for Dodo to create during it.
 */
export async function ensureCustomer(
  workspace: { id: string; name: string; billingCustomerId: string | null },
  owner: { email: string; name: string | null },
): Promise<string> {
  if (workspace.billingCustomerId) return workspace.billingCustomerId;

  try {
    const customer = await dodo<{ customer_id: string }>("POST", "/customers", {
      body: {
        email: owner.email,
        name: owner.name ?? workspace.name,
        metadata: { workspace_id: workspace.id },
      },
    });

    // Conditional on still being empty: two tabs clicking Upgrade at once must
    // not overwrite each other's customer and orphan one set of webhooks.
    const claimed = await prisma.workspace.updateMany({
      where: { id: workspace.id, billingCustomerId: null },
      data: { billingCustomerId: customer.customer_id },
    });
    await traceOutbound("customer.create", {
      workspaceId: workspace.id,
      providerCustomerId: customer.customer_id,
      status: "ok",
      note: claimed.count ? null : "Lost a race to a concurrent request; using the stored customer.",
    });

    if (claimed.count === 0) {
      const stored = await prisma.workspace.findUnique({
        where: { id: workspace.id },
        select: { billingCustomerId: true },
      });
      if (stored?.billingCustomerId) return stored.billingCustomerId;
    }
    return customer.customer_id;
  } catch (error) {
    await traceOutbound("customer.create", {
      workspaceId: workspace.id,
      status: "failed",
      error: (error as Error).message,
    });
    throw error;
  }
}

export async function createCheckout(input: {
  workspaceId: string;
  customerId: string;
  plan: PurchasablePlan;
  interval: BillingInterval;
  returnUrl: string;
}): Promise<string> {
  const productId = productFor(input.plan, input.interval);
  if (!productId) throw new DodoError("That plan isn't available right now.", 503);

  try {
    const session = await dodo<{ session_id: string; checkout_url?: string | null }>(
      "POST",
      "/checkouts",
      {
        body: {
          product_cart: [{ product_id: productId, quantity: 1 }],
          customer: { customer_id: input.customerId },
          return_url: input.returnUrl,
          // A fallback only: webhooks map by customer_id. Dodo documents this
          // as payment metadata and doesn't promise it reaches the subscription.
          metadata: { workspace_id: input.workspaceId, plan: input.plan, interval: input.interval },
        },
      },
    );
    if (!session.checkout_url) throw new DodoError("Dodo did not return a checkout URL.", 502);

    await traceOutbound("checkout.create", {
      workspaceId: input.workspaceId,
      providerCustomerId: input.customerId,
      status: "ok",
      note: `${input.plan} / ${input.interval} · session ${session.session_id}`,
    });
    return session.checkout_url;
  } catch (error) {
    await traceOutbound("checkout.create", {
      workspaceId: input.workspaceId,
      providerCustomerId: input.customerId,
      status: "failed",
      error: (error as Error).message,
      note: `${input.plan} / ${input.interval}`,
    });
    throw error;
  }
}

export async function createPortalSession(input: {
  workspaceId: string;
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  try {
    const session = await dodo<{ link: string }>(
      "POST",
      `/customers/${encodeURIComponent(input.customerId)}/customer-portal/session`,
      { query: { return_url: input.returnUrl } },
    );
    await traceOutbound("portal.create", {
      workspaceId: input.workspaceId,
      providerCustomerId: input.customerId,
      status: "ok",
    });
    return session.link;
  } catch (error) {
    await traceOutbound("portal.create", {
      workspaceId: input.workspaceId,
      providerCustomerId: input.customerId,
      status: "failed",
      error: (error as Error).message,
    });
    throw error;
  }
}

// --- Subscriptions ----------------------------------------------------------

/** The subset of Dodo's Subscription we read. Field names are Dodo's. */
export type DodoSubscription = {
  subscription_id: string;
  status: string;
  product_id: string;
  customer: { customer_id: string; email?: string; name?: string };
  previous_billing_date?: string | null;
  next_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean;
  cancelled_at?: string | null;
  metadata?: Record<string, string | number | boolean> | null;
  /** Present on webhook payloads only. */
  past_due_ends_at?: string | null;
};

export async function fetchSubscription(subscriptionId: string): Promise<DodoSubscription> {
  return dodo<DodoSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** Stop renewal at the end of the paid period. The customer keeps what they paid for. */
export async function scheduleCancel(subscriptionId: string, comment: string): Promise<void> {
  await dodo("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    body: { cancel_at_next_billing_date: true, cancellation_comment: comment.slice(0, 500) },
  });
}

// --- Webhook signatures (Standard Webhooks) ---------------------------------

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type SignatureCheck =
  | { ok: true; webhookId: string; timestamp: number }
  | { ok: false; reason: string };

/**
 * Verify a Dodo webhook. A line-for-line port of the `standardwebhooks`
 * package's `Webhook.verify`, which is what Dodo's own SDK calls:
 *
 *   key       = base64-decode(secret without the "whsec_" prefix)
 *   signed    = `${webhook-id}.${webhook-timestamp}.${raw body}`
 *   signature = base64(HMAC-SHA256(key, signed))
 *
 * `webhook-signature` is a space-separated list of `v1,<sig>`; any one match
 * passes, compared in constant time. The timestamp must be within five minutes
 * either side of now.
 *
 * `rawBody` must be the exact bytes received. Parsing and re-serialising the
 * JSON changes them, and every signature then fails.
 */
export function verifyDodoSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureCheck {
  const id = headers.get("webhook-id");
  const timestampHeader = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestampHeader || !signatureHeader) {
    return { ok: false, reason: "Missing webhook-id, webhook-timestamp or webhook-signature." };
  }
  if (!secret) return { ok: false, reason: "No webhook secret is configured." };

  const timestamp = Number.parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) return { ok: false, reason: "Unreadable webhook-timestamp." };
  if (nowSeconds - timestamp > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp too old — a replay, or the server clock is wrong." };
  }
  if (timestamp > nowSeconds + WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp too far in the future — check the server clock." };
  }

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return { ok: false, reason: "The webhook secret is empty." };

  const expected = Buffer.from(
    createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64"),
  );

  for (const versioned of signatureHeader.split(" ")) {
    const [version, signature] = versioned.split(",");
    if (version !== "v1" || !signature) continue;
    const presented = Buffer.from(signature);
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      return { ok: true, webhookId: id, timestamp };
    }
  }
  return { ok: false, reason: "No matching signature." };
}

/** Sign a payload the way Dodo does. For tests; never used to accept a request. */
export function signDodoPayload(rawBody: string, id: string, timestamp: number, secret: string): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64")}`;
}
