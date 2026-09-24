import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getImpersonation } from "@/lib/impersonation";
import { sendVerificationEmail } from "@/lib/email/tokens";

export const runtime = "nodejs";

/** Send the signed-in user another verification link. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // A support session looks, it doesn't act on the customer's behalf.
  if (await getImpersonation()) {
    return NextResponse.json({ error: "Read-only support session." }, { status: 403 });
  }

  const result = await sendVerificationEmail(user.id);
  switch (result) {
    case "sent":
      return NextResponse.json({ ok: true, message: `Sent — check ${user.email}.` });
    case "verified":
      return NextResponse.json({ ok: true, verified: true, message: "Your email is already verified." });
    case "cooldown":
      return NextResponse.json(
        { error: "We just sent one. Give it a minute, and check your spam folder." },
        { status: 429 },
      );
    default:
      return NextResponse.json({ error: "Couldn't send the email. Try again shortly." }, { status: 502 });
  }
}
