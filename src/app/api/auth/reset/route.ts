import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/email/tokens";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const ok = await resetPassword(parsed.data.token, parsed.data.password);
  if (!ok) {
    return NextResponse.json(
      { error: "This reset link has expired or was already used. Ask for a new one." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
