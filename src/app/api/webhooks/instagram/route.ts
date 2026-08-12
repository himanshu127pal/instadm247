import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyMetaSignature } from "@/lib/crypto";
import { parseWebhook } from "@/lib/meta/webhooks";
import { enqueue } from "@/lib/engine/queues";
import { processWebhookEvent } from "@/lib/engine/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Instagram webhook receiver.
 *
 * Two rules govern this handler:
 *  1. Verify X-Hub-Signature-256 against the RAW body before trusting anything.
 *  2. Acknowledge fast. Meta retries and eventually disables endpoints that are
 *     slow, so we persist + enqueue and return 200 — no processing inline.
 */

/** Verification handshake, run once when the webhook is configured. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === env.meta.webhookVerifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();

  // Signature verification is mandatory. Without an app secret configured we
  // cannot verify anything, so we refuse rather than trusting the payload.
  if (!env.meta.appSecret) {
    console.warn("[webhook] rejected: META_APP_SECRET is not configured");
    return new NextResponse("Not configured", { status: 503 });
  }
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), env.meta.appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  // Never let a processing bug turn into a retry storm — always ack.
  try {
    await intake(body);
  } catch (error) {
    console.error("[webhook] intake failed", error);
  }

  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

async function intake(body: unknown) {
  const { events, effects } = parseWebhook(body);

  for (const event of events) {
    const account = await prisma.instagramAccount.findUnique({
      where: { igUserId: event.igUserId },
      select: { id: true },
    });

    // The unique dedupeKey is what makes Meta's duplicate notifications on
    // boosted posts harmless.
    const record = await prisma.webhookEvent
      .create({
        data: {
          accountId: account?.id ?? null,
          dedupeKey: event.dedupeKey,
          field: event.kind,
          payload: { event } as object,
        },
      })
      .catch(() => null);

    if (!record) continue; // already seen

    const queued = await enqueue("ingest", "process", { webhookEventId: record.id });
    if (!queued) {
      // No Redis — process inline so a single-process deploy still works.
      await processWebhookEvent(record.id).catch((error) =>
        console.error("[webhook] inline processing failed", error),
      );
    }
  }

  for (const effect of effects) {
    const account = await prisma.instagramAccount.findUnique({
      where: { igUserId: effect.igUserId },
      select: { id: true },
    });

    const key = `effect:${effect.type}:${effect.igUserId}:${"igsid" in effect ? effect.igsid : ""}:${effect.at.getTime()}`;
    const record = await prisma.webhookEvent
      .create({
        data: {
          accountId: account?.id ?? null,
          dedupeKey: key,
          field: effect.type,
          payload: { effect } as object,
        },
      })
      .catch(() => null);

    if (!record) continue;

    const queued = await enqueue("ingest", "process", { webhookEventId: record.id });
    if (!queued) {
      await processWebhookEvent(record.id).catch((error) =>
        console.error("[webhook] inline effect processing failed", error),
      );
    }
  }
}
