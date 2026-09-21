import { assertAccount, ok, route } from "@/lib/api";
import { subscribeAccountWebhooks } from "@/lib/meta/webhook-subscribe";

export const runtime = "nodejs";

/**
 * Retry the webhook subscription for one account.
 *
 * Separate from reconnecting on purpose: the usual causes are app-level (an
 * unverified callback URL, a field not enabled on the app), so sending the
 * customer back through OAuth neither fixes them nor tells anyone what is
 * wrong. Once the app config is corrected this succeeds with no OAuth round
 * trip and no new token.
 */
export const POST = route<{ id: string }>(async ({ workspace, params }) => {
  const account = await assertAccount(workspace.id, params.id);
  const result = await subscribeAccountWebhooks(account.id);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return ok({ degraded: result.degraded, fields: result.fields });
});
