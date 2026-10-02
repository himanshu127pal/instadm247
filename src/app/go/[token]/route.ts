import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isPreviewFetch, readTrackedLink, recordTrackedClick } from "@/lib/engine/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A link button in an automation DM. Counts the tap against the automation
 * that sent it, then redirects. See src/lib/engine/links.ts.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const claim = readTrackedLink(token);
  if (!claim) return NextResponse.redirect(new URL("/", env.appUrl));

  if (!isPreviewFetch(request.headers.get("user-agent"))) await recordTrackedClick(claim);

  const response = NextResponse.redirect(claim.u, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
