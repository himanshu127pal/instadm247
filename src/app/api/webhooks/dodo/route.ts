import { handleDodoWebhook } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dodo Payments webhook. Register as <APP_URL>/api/webhooks/dodo.
 *
 * The body is read as TEXT and passed on untouched: the signature covers the
 * exact bytes, and parsing then re-serialising the JSON would break it.
 * Every hit, signed or not, is recorded — see docs/BILLING.md.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const outcome = await handleDodoWebhook(rawBody, request.headers);
  return new Response(null, { status: outcome.httpStatus });
}
