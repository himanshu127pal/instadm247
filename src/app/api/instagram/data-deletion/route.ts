import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { byEitherInstagramId } from "@/lib/meta/identity";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Data deletion request callback (required for Meta App Review).
 *
 * We delete everything we hold for that Instagram user and return a status URL
 * plus a confirmation code, which is the response shape Meta expects.
 */

function parseSignedRequest(signed: string): { user_id?: string } | null {
  const [encodedSig, encodedPayload] = signed.split(".");
  if (!encodedSig || !encodedPayload || !env.meta.appSecret) return null;

  const expected = createHmac("sha256", env.meta.appSecret).update(encodedPayload).digest();
  const actual = Buffer.from(encodedSig, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let signed: string | null = null;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { signed_request?: string };
    signed = body.signed_request ?? null;
  } else {
    const form = await request.formData().catch(() => null);
    signed = (form?.get("signed_request") as string | null) ?? null;
  }

  const payload = signed ? parseSignedRequest(signed) : null;
  if (!payload?.user_id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const igUserId = String(payload.user_id);
  const confirmationCode = randomToken(12);

  // Cascades remove automations, contacts, conversations, messages and stats.
  const removed = await prisma.instagramAccount.deleteMany({
    where: byEitherInstagramId(igUserId),
  });

  // The same person may also appear as a contact of other connected accounts.
  const contacts = await prisma.contact.deleteMany({ where: { igsid: igUserId } });

  if (removed.count === 0 && contacts.count === 0) {
    // We still answer with a confirmation code, because Meta's contract wants
    // one and a request for someone we hold nothing for is legitimately a
    // no-op. But it is also what a broken identifier match looks like, and
    // answering "deleted" while deleting nothing is the worst way to fail.
    console.error(
      `[data-deletion] request for ${igUserId} matched nothing: either we never held this user, or the stored identifier disagrees with Meta's`,
    );
  }

  return NextResponse.json({
    url: `${env.appUrl}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
