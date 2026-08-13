import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Outbound webhooks — POSTs to the customer's own systems when something
 * happens here.
 *
 * Signed the same way Meta signs ours (`X-InstaDM-Signature-256`, HMAC-SHA256
 * of the raw body), so a receiver can verify the payload really came from us.
 * Delivery is best-effort and never blocks the thing that triggered it: a
 * customer's endpoint being down must not fail a flow.
 */

export type WebhookEventName =
  | "contact.created"
  | "lead.captured"
  | "flow.completed"
  | "message.sent"
  | "message.failed";

const TIMEOUT_MS = 8000;
/** Stop hammering an endpoint that's been failing for a long time. */
const FAILURE_CUTOFF = 20;

export async function emitWebhook(
  workspaceId: string,
  event: WebhookEventName,
  data: Record<string, unknown>,
): Promise<void> {
  let endpoints;
  try {
    endpoints = await prisma.webhookEndpoint.findMany({
      where: { workspaceId, enabled: true, events: { has: event } },
    });
  } catch (error) {
    console.warn("[webhooks] could not load endpoints", (error as Error).message);
    return;
  }
  if (endpoints.length === 0) return;

  const body = JSON.stringify({
    event,
    created_at: new Date().toISOString(),
    data,
  });

  await Promise.all(
    endpoints.map(async (endpoint) => {
      if (endpoint.failureCount >= FAILURE_CUTOFF) return;

      const signature =
        "sha256=" + createHmac("sha256", endpoint.secret).update(body, "utf8").digest("hex");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-InstaDM-Signature-256": signature,
            "X-InstaDM-Event": event,
          },
          body,
          signal: controller.signal,
        });

        await prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: {
            lastStatus: res.status,
            lastFiredAt: new Date(),
            // Any 2xx clears the failure streak.
            failureCount: res.ok ? 0 : endpoint.failureCount + 1,
          },
        });
      } catch (error) {
        await prisma.webhookEndpoint
          .update({
            where: { id: endpoint.id },
            data: {
              lastStatus: null,
              lastFiredAt: new Date(),
              failureCount: endpoint.failureCount + 1,
            },
          })
          .catch(() => undefined);
        console.warn(`[webhooks] delivery to ${endpoint.url} failed:`, (error as Error).message);
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
