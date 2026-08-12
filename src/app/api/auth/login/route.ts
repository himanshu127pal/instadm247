import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authenticate, createSession } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
    }

    const user = await authenticate(parsed.data.email, parsed.data.password);
    await createSession(user.id, {
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[auth] login failed", error);
    return NextResponse.json({ error: "Could not sign you in." }, { status: 500 });
  }
}
