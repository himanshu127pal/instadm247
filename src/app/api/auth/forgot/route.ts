import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/email/tokens";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email("Enter a valid email address") });

/**
 * Always answers the same way, whether or not the address has an account, so
 * this can't be used to find out who's a customer.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter your email" }, { status: 400 });
  }
  try {
    await requestPasswordReset(parsed.data.email);
  } catch (error) {
    // Logged, not surfaced: a different answer on failure would leak whether
    // the address exists.
    console.error("[auth] password reset request failed", error);
  }
  return NextResponse.json({ ok: true });
}
