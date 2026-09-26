import { env } from "@/lib/env";
import { PLANS, type BillingInterval, type PurchasablePlan } from "./plans";

/**
 * Checks the Dodo setup against the price list, before anyone pays. Run with
 * `pnpm billing:check`. See docs/BILLING.md §Switching it on.
 *
 * Everything here is read-only: it looks at the products and webhooks in the
 * Dodo account the API key belongs to, and never prints a key or a secret.
 * The mistakes it exists to catch are the expensive ones — a monthly and a
 * yearly product ID swapped, a price that doesn't match the pricing page, a
 * test-mode key pointed at live products, or a webhook secret from a different
 * endpoint (which would take the money and then reject the webhook that grants
 * the plan).
 *
 * Shapes and endpoints are from Dodo's official SDK (dodopayments@2.51.0):
 * `GET /products/{id}`, `GET /webhooks`, `GET /webhooks/{id}/secret`.
 */

export type Finding = { level: "ok" | "warn" | "error"; message: string };

type RecurringPrice = {
  type: "recurring_price";
  currency: string;
  price: number;
  payment_frequency_count: number;
  payment_frequency_interval: "Day" | "Week" | "Month" | "Year";
  trial_period_days?: number;
  discount?: number;
  discount_bps?: number | null;
  tax_inclusive?: boolean | null;
};

type Product = {
  product_id: string;
  name?: string | null;
  is_recurring: boolean;
  price: RecurringPrice | { type: string };
};

type Webhook = { id: string; url: string; disabled?: boolean | null; filter_types?: string[] | null };

const LABEL: Record<PurchasablePlan, string> = { pro: "Pro", business: "Business" };
const ENV_NAME: Record<PurchasablePlan, Record<BillingInterval, string>> = {
  pro: { month: "DODO_PRODUCT_PRO_MONTHLY", year: "DODO_PRODUCT_PRO_YEARLY" },
  business: { month: "DODO_PRODUCT_BUSINESS_MONTHLY", year: "DODO_PRODUCT_BUSINESS_YEARLY" },
};

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function get<T>(path: string): Promise<T> {
  const { apiKey, baseUrl } = env.billing.dodo;
  const res = await fetch(new URL(path, baseUrl), {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as T;
}

/** Does this look like a Standard Webhooks secret: `whsec_` + base64 of a real key? */
function secretLooksRight(secret: string): boolean {
  if (!secret.startsWith("whsec_")) return false;
  const body = secret.slice("whsec_".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return false;
  return Buffer.from(body, "base64").length >= 24;
}

export async function checkDodoSetup(): Promise<Finding[]> {
  const out: Finding[] = [];
  const ok = (message: string) => out.push({ level: "ok", message });
  const warn = (message: string) => out.push({ level: "warn", message });
  const error = (message: string) => out.push({ level: "error", message });

  const { dodo } = env.billing;
  const live = dodo.baseUrl.includes("live.");
  const mode = live ? "live mode" : "test mode";
  ok(`Checking Dodo in ${mode} (DODO_PAYMENTS_ENVIRONMENT=${live ? "live_mode" : "test_mode"}).`);

  // --- The environment -------------------------------------------------------

  if (!dodo.apiKey) {
    error("DODO_PAYMENTS_API_KEY is not set.");
    return out;
  }
  if (!dodo.webhookSecret) error("DODO_PAYMENTS_WEBHOOK_SECRET is not set.");
  else if (!secretLooksRight(dodo.webhookSecret)) {
    error("DODO_PAYMENTS_WEBHOOK_SECRET doesn't look like a webhook secret. It should start with whsec_.");
  }

  const ids: Array<{ plan: PurchasablePlan; interval: BillingInterval; id: string }> = [];
  for (const plan of ["pro", "business"] as const) {
    for (const interval of ["month", "year"] as const) {
      const id = dodo.products[plan][interval];
      if (!id) error(`${ENV_NAME[plan][interval]} is not set.`);
      else ids.push({ plan, interval, id });
    }
  }
  const seen = new Map<string, string>();
  for (const { plan, interval, id } of ids) {
    const name = ENV_NAME[plan][interval];
    if (seen.has(id)) error(`${name} and ${seen.get(id)} are the same product. Each needs its own.`);
    seen.set(id, name);
  }

  if (env.billing.enabled) {
    warn("BILLING_ENABLED is already true, so customers can check out right now.");
  } else {
    ok("BILLING_ENABLED is off, so customers can't check out yet. Staff can test on Plan & billing.");
  }

  // --- The key, and each product ---------------------------------------------

  for (const { plan, interval, id } of ids) {
    const name = ENV_NAME[plan][interval];
    let product: Product;
    try {
      product = await get<Product>(`/products/${encodeURIComponent(id)}`);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      if (status === 401 || status === 403) {
        error(
          `Dodo rejected the API key (${status}). Check it's a ${mode} key. Test and live keys don't work on each other's products.`,
        );
        return out;
      }
      if (status === 404) {
        error(`${name}: no product ${id} in ${mode}. Test and live products have different IDs.`);
      } else {
        error(`${name}: couldn't reach Dodo (${status || (e as Error).message}).`);
      }
      continue;
    }

    const label = `${name} (${product.name ?? id})`;
    const price = product.price as RecurringPrice;
    if (!product.is_recurring || price.type !== "recurring_price") {
      error(`${label} isn't a subscription product. Create it with subscription pricing.`);
      continue;
    }

    const want = PLANS[plan].price![interval];
    const problems: string[] = [];
    if (price.currency !== "USD") problems.push(`it's priced in ${price.currency}, the pricing page shows USD`);
    if (price.price !== want * 100) {
      problems.push(`it costs ${(price.price / 100).toFixed(2)}, the pricing page says ${want}.00`);
    }
    const everyYear =
      (price.payment_frequency_interval === "Year" && price.payment_frequency_count === 1) ||
      (price.payment_frequency_interval === "Month" && price.payment_frequency_count === 12);
    const everyMonth = price.payment_frequency_interval === "Month" && price.payment_frequency_count === 1;
    if (interval === "month" && !everyMonth) {
      problems.push(`it bills every ${price.payment_frequency_count} ${price.payment_frequency_interval}, not every month`);
    }
    if (interval === "year" && !everyYear) {
      problems.push(`it bills every ${price.payment_frequency_count} ${price.payment_frequency_interval}, not every year`);
    }
    if (problems.length) {
      error(`${label}: ${problems.join("; ")}. ${LABEL[plan]} ${interval === "month" ? "monthly" : "yearly"} is wrong.`);
    } else {
      ok(`${label}: ${LABEL[plan]}, ${want} USD every ${interval}.`);
    }

    if ((price.trial_period_days ?? 0) > 0) {
      warn(`${label} has a ${price.trial_period_days}-day trial. The app doesn't offer or describe trials; remove it unless you mean to.`);
    }
    if ((price.discount_bps ?? 0) > 0 || (price.discount ?? 0) > 0) {
      warn(`${label} has a discount on the product itself, so customers pay less than the pricing page says.`);
    }
  }

  // --- The webhook -------------------------------------------------------------

  const url = `${env.appUrl}/api/webhooks/dodo`;
  if (/localhost|127\.0\.0\.1/.test(env.appUrl)) {
    warn(`APP_URL is ${env.appUrl}, so the webhook check looks for ${url}. Run this on the server, or with APP_URL set to the live address.`);
  }
  let webhooks: Webhook[] = [];
  try {
    webhooks = (await get<{ data: Webhook[] }>("/webhooks?limit=100")).data ?? [];
  } catch (e) {
    error(`Couldn't list webhooks (${e instanceof HttpError ? e.status : (e as Error).message}).`);
    return out;
  }
  const hook = webhooks.find((w) => w.url.replace(/\/+$/, "") === url);
  if (!hook) {
    error(
      `No webhook in ${mode} points at ${url}. Add one in the Webhooks section of the Dodo dashboard.` +
        (webhooks.length ? ` Found: ${webhooks.map((w) => w.url).join(", ")}.` : ""),
    );
    return out;
  }
  if (hook.disabled) error(`The webhook for ${url} is disabled in Dodo. Enable it, or no plan will ever change.`);
  else ok(`Webhook found for ${url}.`);

  const filters = hook.filter_types ?? [];
  if (filters.length && !filters.some((f) => f.startsWith("subscription."))) {
    error("The webhook doesn't send any subscription.* events. Subscribe it to all events, or at least every subscription.* one.");
  } else if (filters.length) {
    warn(`The webhook only sends ${filters.length} event types. Subscribing to all events is simplest; the app records every one.`);
  }

  if (dodo.webhookSecret) {
    try {
      const { secret } = await get<{ secret: string }>(`/webhooks/${encodeURIComponent(hook.id)}/secret`);
      if (secret === dodo.webhookSecret) ok("DODO_PAYMENTS_WEBHOOK_SECRET matches that webhook.");
      else {
        error(
          "DODO_PAYMENTS_WEBHOOK_SECRET is not this webhook's secret. Every payment would be taken and its webhook rejected. Copy the secret from this endpoint.",
        );
      }
    } catch (e) {
      warn(`Couldn't read the webhook's secret to compare (${e instanceof HttpError ? e.status : (e as Error).message}). Check it by hand.`);
    }
  }

  return out;
}
