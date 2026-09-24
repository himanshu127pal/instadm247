/**
 * Environment configuration.
 *
 * Design rule (see CLAUDE.md): the app must boot and the entire dashboard must
 * be usable with NO Meta credentials. Missing META_APP_ID / META_APP_SECRET
 * degrades Instagram connectivity to a clearly-explained "not configured"
 * state — it never throws at import time.
 */

function str(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function int(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const APP_URL = str("APP_URL", "http://localhost:3000").replace(/\/+$/, "");

export const env = {
  appUrl: APP_URL,
  isProd: process.env.NODE_ENV === "production",

  databaseUrl: str("DATABASE_URL"),
  redisUrl: str("REDIS_URL", "redis://localhost:6379"),

  sessionSecret: str(
    "SESSION_SECRET",
    // Dev-only fallback so `pnpm dev` works before .env exists. Never used in
    // production — assertProductionSecrets() below refuses to let that happen.
    "insecure-development-session-secret-do-not-use-in-production",
  ),
  encryptionKey: str("ENCRYPTION_KEY", "ZGV2LW9ubHktaW5zZWN1cmUta2V5LTMyYnl0ZXMh"),

  meta: {
    appId: str("META_APP_ID"),
    appSecret: str("META_APP_SECRET"),
    redirectUri: str("META_REDIRECT_URI", `${APP_URL}/api/instagram/callback`),
    webhookVerifyToken: str("META_WEBHOOK_VERIFY_TOKEN", "instadm247-verify-token"),
    apiVersion: str("META_API_VERSION", "v23.0"),
  },

  anthropicApiKey: str("ANTHROPIC_API_KEY"),

  /** See docs/BILLING.md. Nothing is enforced until `enabled` is true. */
  billing: {
    enabled: str("BILLING_ENABLED") === "true",
    dodo: {
      apiKey: str("DODO_PAYMENTS_API_KEY"),
      webhookSecret: str("DODO_PAYMENTS_WEBHOOK_SECRET"),
      baseUrl:
        str("DODO_PAYMENTS_ENVIRONMENT", "test_mode") === "live_mode"
          ? "https://live.dodopayments.com"
          : "https://test.dodopayments.com",
      products: {
        pro: {
          month: str("DODO_PRODUCT_PRO_MONTHLY"),
          year: str("DODO_PRODUCT_PRO_YEARLY"),
        },
        business: {
          month: str("DODO_PRODUCT_BUSINESS_MONTHLY"),
          year: str("DODO_PRODUCT_BUSINESS_YEARLY"),
        },
      },
    },
  },

  limits: {
    messagesPerHour: int("RATE_LIMIT_MESSAGES_PER_HOUR", 180),
    privateRepliesPerHour: int("RATE_LIMIT_PRIVATE_REPLIES_PER_HOUR", 600),
  },
} as const;

/** True when live Instagram API calls are possible. */
export function isInstagramConfigured(): boolean {
  return Boolean(env.meta.appId && env.meta.appSecret);
}

/** True when the AI agent node can actually call a model. */
/** True when checkout can be offered: the provider is reachable and priced. */
export function isBillingConfigured(): boolean {
  const { dodo } = env.billing;
  return Boolean(
    dodo.apiKey &&
      dodo.webhookSecret &&
      dodo.products.pro.month &&
      dodo.products.business.month,
  );
}

export function isAiConfigured(): boolean {
  return Boolean(env.anthropicApiKey);
}

/** Human-readable list of what's missing, for the Settings UI. */
export function missingInstagramConfig(): string[] {
  const missing: string[] = [];
  if (!env.meta.appId) missing.push("META_APP_ID");
  if (!env.meta.appSecret) missing.push("META_APP_SECRET");
  return missing;
}

/**
 * Call from the worker/server entrypoints in production so a deploy fails loudly
 * rather than silently running with development secrets.
 */
export function assertProductionSecrets(): void {
  if (!env.isProd) return;
  const problems: string[] = [];
  if (env.sessionSecret.startsWith("insecure-development")) problems.push("SESSION_SECRET");
  if (env.encryptionKey.startsWith("ZGV2LW9ubHkt")) problems.push("ENCRYPTION_KEY");
  if (!env.databaseUrl) problems.push("DATABASE_URL");
  // Billing switched on without these would take a customer's money and then
  // reject the webhook that grants their plan. That must not be able to boot.
  if (env.billing.enabled) {
    if (!env.billing.dodo.apiKey) problems.push("DODO_PAYMENTS_API_KEY");
    if (!env.billing.dodo.webhookSecret) problems.push("DODO_PAYMENTS_WEBHOOK_SECRET");
  }
  if (problems.length) {
    throw new Error(
      `Refusing to start in production with unset/default secrets: ${problems.join(", ")}`,
    );
  }
}
