import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, createSession, registerUser } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid details" },
        { status: 400 },
      );
    }

    const { user } = await registerUser(parsed.data);
    await createSession(user.id, {
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[auth] signup failed", error);
    return NextResponse.json({ error: "Could not create your account." }, { status: 500 });
  }
}
