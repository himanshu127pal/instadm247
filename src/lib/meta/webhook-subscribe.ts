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
        webhookError: result.degraded
          ? `Instagram refused ${result.refused.join(", ")}. Enable those fields on the app under Instagram → Configure webhooks, then retry. Meta said: ${result.fullListError}`
          : null,
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
