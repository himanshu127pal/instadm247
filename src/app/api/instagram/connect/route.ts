import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getActiveWorkspace } from "@/lib/auth";
import { isInstagramConfigured, missingInstagramConfig } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/meta/oauth";
import { randomToken } from "@/lib/crypto";

export const runtime = "nodejs";

/** Kick off Business Login for Instagram. */
export async function GET() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));

  if (!isInstagramConfigured()) {
    // Log which credential is missing for us; tell the customer only that it is
    // ours to fix. Our env var names are not their business.
    console.error(
      `[instagram:connect] refused — missing ${missingInstagramConfig().join(", ")}`,
    );
    return NextResponse.redirect(
      new URL(
        `/dashboard/accounts?error=${encodeURIComponent("Connecting Instagram is temporarily unavailable. This is on our side — please try again shortly.")}`,
        process.env.APP_URL ?? "http://localhost:3000",
      ),
    );
  }

  // CSRF: the state is echoed back by Instagram and must match the cookie.
  const state = randomToken(16);
  const jar = await cookies();
  jar.set("idm_oauth_state", `${state}:${workspace.id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
