import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  await destroySession();
  return NextResponse.redirect(new URL("/", env.appUrl));
}
