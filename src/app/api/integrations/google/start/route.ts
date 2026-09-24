import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { isGoogleConfigured } from "@/lib/env";
import { AuthError } from "@/lib/auth";
import { route } from "@/lib/api";
import { requireFeature } from "@/lib/plan";
import { isImpersonating } from "@/lib/impersonation";
import { authorizeUrl } from "@/lib/integrations/google-sheets";

export const runtime = "nodejs";


/** Send the customer to Google to connect Sheets. */
export const GET = route(async ({ workspace }) => {
  if (await isImpersonating()) {
    throw new AuthError("A support session can't connect the customer's Google account.", 403);
  }
  if (!isGoogleConfigured()) {
    throw new AuthError("Google Sheets isn't available right now. Please try again later.", 503);
  }
  requireFeature(workspace, "integrations");

  // The state names the workspace it was issued for and is checked against
  // this cookie on the way back, so a callback can't be replayed into another
  // workspace or forged from another site.
  const state = randomToken(24);
  const jar = await cookies();
  jar.set("idm_google_state", `${state}.${workspace.id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/integrations/google",
    maxAge: 10 * 60,
  });
  return NextResponse.redirect(authorizeUrl(state));
});
