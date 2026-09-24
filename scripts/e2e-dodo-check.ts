/**
 * `pnpm billing:check`, run from e2e-check.ts against a stubbed Dodo account.
 * See src/lib/billing/check.ts.
 */

import { env } from "../src/lib/env";
import { checkDodoSetup, type Finding } from "../src/lib/billing/check";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

type Dodo = {
  apiKey: string;
  webhookSecret: string;
  baseUrl: string;
  products: { pro: { month: string; year: string }; business: { month: string; year: string } };
};
type Mutable = { appUrl: string; billing: { enabled: boolean; dodo: Dodo } };
const mutableEnv = env as unknown as Mutable;

const SECRET = `whsec_${Buffer.from("a-thirty-two-byte-long-hmac-key!").toString("base64")}`;
const KEY = "dodo_test_key_that_must_never_be_printed";

const product = (id: string, price: number, interval: "Month" | "Year", extra: object = {}) => ({
  product_id: id,
  name: id,
  is_recurring: true,
  price: {
    type: "recurring_price",
    currency: "USD",
    price,
    payment_frequency_count: 1,
    payment_frequency_interval: interval,
    subscription_period_count: 10,
    subscription_period_interval: "Year",
    trial_period_days: 0,
    ...extra,
  },
});

export async function runDodoCheckChecks(check: Check, section: Section) {
  section("Billing setup check (pnpm billing:check)");

  const saved = { appUrl: mutableEnv.appUrl, enabled: mutableEnv.billing.enabled, dodo: { ...mutableEnv.billing.dodo } };
  let products: Record<string, object> = {};
  let webhooks: Array<{ id: string; url: string; disabled?: boolean; filter_types?: string[] }> = [];
  let secret = SECRET;
  let status = 200;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.host !== "test.dodopayments.com") return realFetch(input, init);
    const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code });
    if (status !== 200) return json({ message: "nope" }, status);
    const match = url.pathname.match(/^\/products\/(.+)$/);
    if (match) return products[match[1]] ? json(products[match[1]]) : json({ message: "not found" }, 404);
    if (url.pathname === "/webhooks") return json({ data: webhooks, iterator: "", done: true });
    if (/^\/webhooks\/[^/]+\/secret$/.test(url.pathname)) return json({ secret });
    return json({ message: "unknown" }, 404);
  }) as typeof fetch;

  const run = async () => {
    const findings = await checkDodoSetup();
    return { findings, errors: findings.filter((f) => f.level === "error"), text: findings.map((f) => f.message).join("\n") };
  };
  const has = (fs: Finding[], re: RegExp) => fs.some((f) => re.test(f.message));

  try {
    mutableEnv.appUrl = "https://app.example.com";
    mutableEnv.billing.enabled = false;
    mutableEnv.billing.dodo = {
      apiKey: KEY,
      webhookSecret: SECRET,
      baseUrl: "https://test.dodopayments.com",
      products: { pro: { month: "pdt_pm", year: "pdt_py" }, business: { month: "pdt_bm", year: "pdt_by" } },
    };
    const good = () => {
      products = {
        pdt_pm: product("pdt_pm", 1900, "Month"),
        pdt_py: product("pdt_py", 19000, "Year"),
        pdt_bm: product("pdt_bm", 7900, "Month"),
        pdt_by: product("pdt_by", 79000, "Year"),
      };
      webhooks = [{ id: "whk_1", url: "https://app.example.com/api/webhooks/dodo" }];
      secret = SECRET;
      status = 200;
    };

    good();
    const clean = await run();
    check("a correct setup passes", clean.errors.length === 0, clean.text);
    check("and it never prints the API key or the webhook secret", !clean.text.includes(KEY) && !clean.text.includes(SECRET));

    good();
    mutableEnv.billing.dodo.products.pro = { month: "pdt_py", year: "pdt_pm" };
    const swapped = await run();
    check("monthly and yearly swapped is caught", has(swapped.errors, /Pro monthly is wrong/) && has(swapped.errors, /Pro yearly is wrong/));
    mutableEnv.billing.dodo.products.pro = { month: "pdt_pm", year: "pdt_py" };

    good();
    products.pdt_bm = product("pdt_bm", 6900, "Month");
    check("a price that doesn't match the pricing page is caught", has((await run()).errors, /costs 69\.00, the pricing page says 79/));

    good();
    products.pdt_bm = product("pdt_bm", 7900, "Month", { currency: "INR" });
    check("the wrong currency is caught", has((await run()).errors, /priced in INR/));

    good();
    delete products.pdt_by;
    check("a product ID that isn't in this mode is caught", has((await run()).errors, /no product pdt_by in test mode/));

    good();
    status = 401;
    check("a key for the other mode is caught", has((await run()).errors, /rejected the API key/));

    good();
    secret = `whsec_${Buffer.from("a-different-endpoint-secret-key!").toString("base64")}`;
    check("a webhook secret from another endpoint is caught", has((await run()).errors, /not this webhook's secret/));

    good();
    webhooks = [{ id: "whk_1", url: "https://old.example.com/api/webhooks/dodo" }];
    check("a webhook pointing somewhere else is caught", has((await run()).errors, /No webhook in test mode points at/));

    good();
    webhooks = [{ id: "whk_1", url: "https://app.example.com/api/webhooks/dodo", filter_types: ["payment.succeeded"] }];
    check("a webhook that sends no subscription events is caught", has((await run()).errors, /doesn't send any subscription/));

    good();
    products.pdt_pm = product("pdt_pm", 1900, "Month", { trial_period_days: 7 });
    const trial = await run();
    check("a trial is flagged, not failed", trial.errors.length === 0 && has(trial.findings, /7-day trial/));

    good();
    mutableEnv.billing.dodo.products.business.year = "pdt_bm";
    check("the same product used twice is caught", has((await run()).errors, /are the same product/));
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.appUrl = saved.appUrl;
    mutableEnv.billing.enabled = saved.enabled;
    mutableEnv.billing.dodo = saved.dodo;
  }
}
