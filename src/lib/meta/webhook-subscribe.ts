import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { InstagramClient } from "./client";

/**
 * Subscribe an account to our webhook fields, recording the outcome.
 *
 * The result is stored rather than thrown because every caller wants the same
 * thing: the account row reflecting reality, and a message a human can act on.
 *
 * The failures that actually happen here are app-level, not account-level:
 *
 *   - the webhook callback URL is not configured, or its verification failed
 *   - the field list contains a field the app has not enabled
 *   - the token lacks a permission the field requires
 *
 * None of those are fixed by reconnecting the account, which is what the
 * dashboard used to advise, so the message matters more than the retry.
 */
/**
 * Turn per-field refusals into one line someone can act on.
 *
 * Meta answers an unknown field name with the full set it does accept, which is
 * long and identical for every field — so the reasons are grouped rather than
 * listed per field, and the difference that matters is called out: a field
 * Instagram does not offer at all is ours to remove from the code, while a
 * field it offers but refuses is one the app has not enabled.
 */
function describeRefusals(refused: string[], reasons: Record<string, string>): string {
  const unknown = refused.filter((f) => /must be one of/i.test(reasons[f] ?? ""));
  const notEnabled = refused.filter((f) => !unknown.includes(f));

  const parts: string[] = [];
  if (notEnabled.length) {
    parts.push(
      `Instagram refused ${notEnabled.join(", ")}. Most often these are simply not ticked on the app under Instagram → Configure webhooks. Enable them there, then use Retry subscription.`,
    );
  }
  if (unknown.length) {
    parts.push(
      `Instagram does not offer ${unknown.join(", ")} on this login type at all; that is ours to fix, not yours.`,
    );
  }
  const sample = reasons[refused[0]];
  if (sample) parts.push(`Meta said: ${sample}`);
  return parts.join(" ");
}

export async function subscribeAccountWebhooks(accountId: string): Promise<{
  ok: boolean;
  degraded: boolean;
  fields: string[];
  error?: string;
}> {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, degraded: false, fields: [], error: "Account not found." };

  if (account.status === "demo" || !account.accessTokenEnc) {
    return { ok: false, degraded: false, fields: [], error: "This account has no live token." };
  }

  // decrypt() fails closed when ENCRYPTION_KEY has changed or the ciphertext is
  // damaged. Reconnecting genuinely is the fix for that one, so say so.
  const token = decrypt(account.accessTokenEnc);
  if (!token) {
    const error = "This account's stored token could not be read. Reconnect the account.";
    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: { webhookSubbed: false, lastWebhookTryAt: new Date(), webhookError: error },
    });
    return { ok: false, degraded: false, fields: [], error };
  }

  const client = new InstagramClient(token, account.igUserId);

  try {
    const result = await client.subscribeWebhooksWithFallback();
    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: {
        webhookSubbed: true,
        webhookFields: result.fields,
        lastWebhookTryAt: new Date(),
        webhookError: result.degraded ? describeRefusals(result.refused, result.reasons) : null,
      },
    });
    return { ok: true, degraded: result.degraded, fields: result.fields };
  } catch (error) {
    const message = (error as Error).message || "Instagram refused the webhook subscription.";
    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: {
        webhookSubbed: false,
        webhookFields: [],
        lastWebhookTryAt: new Date(),
        webhookError: message,
      },
    });
    return { ok: false, degraded: false, fields: [], error: message };
  }
}
