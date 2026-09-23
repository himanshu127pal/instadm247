import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { notifyInstagramAccessRemoved } from "@/lib/email/notify";
import { byEitherInstagramId } from "@/lib/meta/identity";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deauthorize + data deletion callbacks. Meta requires both URLs to be
 * configured and working before App Review passes.
 *
 * Meta POSTs a `signed_request` of the form `<base64url signature>.<base64url payload>`,
 * signed with the app secret.
 */

type SignedRequestPayload = { user_id?: string; algorithm?: string; issued_at?: number };

function parseSignedRequest(signed: string): SignedRequestPayload | null {
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

async function readSignedRequest(request: Request): Promise<SignedRequestPayload | null> {
  const contentType = request.headers.get("content-type") ?? "";
  let signed: string | null = null;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { signed_request?: string };
    signed = body.signed_request ?? null;
  } else {
    const form = await request.formData().catch(() => null);
    signed = (form?.get("signed_request") as string | null) ?? null;
  }

  return signed ? parseSignedRequest(signed) : null;
}

/** The user removed our app from their Instagram account. */
export async function POST(request: Request) {
  const payload = await readSignedRequest(request);
  if (!payload?.user_id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Who to tell, read before the update: only accounts that were still live —
  // Meta can send this more than once.
  const affected = await prisma.instagramAccount.findMany({
    where: { ...byEitherInstagramId(String(payload.user_id)), status: { not: "revoked" } },
    select: { id: true, workspaceId: true, username: true },
  });

  const result = await prisma.instagramAccount.updateMany({
    where: byEitherInstagramId(String(payload.user_id)),
    data: {
      status: "revoked",
      accessTokenEnc: null,
      tokenExpiresAt: null,
      webhookSubbed: false,
      automationPaused: true,
      pausedReason: "This Instagram account removed access to the app.",
    },
  });

  if (result.count === 0) {
    // Meta only ever sends this for an account that authorised us, so no match
    // means our stored identifier disagrees with theirs — and the revocation
    // did nothing.
    console.error(
      `[deauthorize] no account matched ${payload.user_id}; access was NOT revoked locally`,
    );
  }

  for (const account of affected) {
    await notifyInstagramAccessRemoved(account).catch((error) =>
      console.error("[deauthorize] access removed email failed", error),
    );
  }

  return NextResponse.json({ success: true });
}
