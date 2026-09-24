import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * The payment trace — every webhook hit and every call we make to the
 * provider. See docs/BILLING.md §The payment trace log.
 *
 * The rule the webhook route follows: the row is written FIRST, before the
 * signature is even checked, so nothing that reaches us can go unrecorded —
 * not a forged request, not a duplicate, not a crash halfway through.
 */

export type TraceStatus =
  | "received"
  | "processed"
  | "ignored"
  | "duplicate"
  | "unmatched"
  | "rejected"
  | "failed"
  | "ok";

/** Rejected hits are unauthenticated input; cap what we keep of them. */
const REJECTED_PAYLOAD_BYTES = 8 * 1024;

export const REJECTED_RETENTION_DAYS = 30;

type Fields = {
  type?: string | null;
  workspaceId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerPaymentId?: string | null;
  amount?: number | null;
  currency?: string | null;
  signatureValid?: boolean | null;
  status: TraceStatus;
  error?: string | null;
  note?: string | null;
  payload?: unknown;
  httpStatus?: number | null;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

/** Record an inbound hit. Returns the row id so the handler can update it. */
export async function traceInbound(webhookId: string | null, fields: Fields): Promise<string> {
  const { payload, ...rest } = fields;
  const row = await prisma.paymentEvent.create({
    data: { direction: "inbound", webhookId, ...rest, payload: toJson(payload) },
    select: { id: true },
  });
  return row.id;
}

export async function updateTrace(id: string, fields: Partial<Fields>): Promise<void> {
  const { payload, ...rest } = fields;
  await prisma.paymentEvent.update({
    where: { id },
    data: {
      ...rest,
      ...(payload !== undefined ? { payload: toJson(payload) } : {}),
      ...(rest.status && rest.status !== "received" ? { processedAt: new Date() } : {}),
    },
  });
}

/**
 * Record a call WE made to the provider — creating a customer, a checkout, a
 * portal session, a cancel, a resync. With these in the same log, one
 * customer's trail reads end to end: clicked Upgrade, checkout created,
 * payment succeeded, subscription active.
 */
export async function traceOutbound(type: string, fields: Omit<Fields, "type">): Promise<void> {
  const { payload, ...rest } = fields;
  await prisma.paymentEvent
    .create({
      data: { direction: "outbound", type, ...rest, payload: toJson(payload) },
    })
    // Tracing must never be the reason a checkout fails.
    .catch((error) => console.error("[billing:trace] could not record outbound call", error));
}

/** Truncate an unauthenticated body before storing it. */
export function capRejectedBody(raw: string): unknown {
  if (Buffer.byteLength(raw, "utf8") <= REJECTED_PAYLOAD_BYTES) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  return {
    truncated: true,
    bytes: Buffer.byteLength(raw, "utf8"),
    raw: Buffer.from(raw, "utf8").subarray(0, REJECTED_PAYLOAD_BYTES).toString("utf8"),
  };
}

/** Has an earlier hit with this webhook-id already been fully processed? */
export async function alreadyProcessed(webhookId: string, excludeId: string): Promise<boolean> {
  const earlier = await prisma.paymentEvent.findFirst({
    where: { webhookId, status: "processed", id: { not: excludeId } },
    select: { id: true },
  });
  return Boolean(earlier);
}

export async function purgeRejectedPaymentEvents(
  retentionDays = REJECTED_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.paymentEvent.deleteMany({
    where: { status: "rejected", receivedAt: { lt: cutoff } },
  });
  return result.count;
}
