import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { getActiveWorkspace, getCurrentUser } from "@/lib/auth";
import { hasFeature } from "@/lib/plan";
import { connect, exchangeCode } from "@/lib/integrations/google-sheets";

export const runtime = "nodejs";

const STATE_COOKIE = "idm_google_state";

function back(result: "connected" | "cancelled" | "error", reason?: string) {
  const params = new URLSearchParams({ tab: "integrations", google: result, ...(reason ? { reason } : {}) });
  return NextResponse.redirect(`${env.appUrl}/dashboard/developers?${params}`);
}

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google sends the customer back here after they approve (or don't). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const cookie = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete({ name: STATE_COOKIE, path: "/api/integrations/google" });

  if (url.searchParams.get("error")) return back("cancelled");

  const [expectedState, workspaceId] = cookie.split(".");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!expectedState || !workspaceId || !code || !same(state, expectedState)) {
    return back("error", "The sign-in link expired. Please try connecting again.");
  }

  const user = await getCurrentUser();
  const workspace = await getActiveWorkspace();
  if (!user || !workspace || workspace.id !== workspaceId) {
    return back("error", "You were signed out or switched workspace. Please try again.");
  }
  if (!hasFeature(workspace, "integrations")) {
    return back("error", "Google Sheets is part of a paid plan.");
  }

  try {
    const tokens = await exchangeCode(code);
    await connect(workspace.id, tokens);
    return back("connected");
  } catch (error) {
    console.error("[integrations] google connect failed", (error as Error).message);
    return back("error", "Google didn't finish connecting. Please try again.");
  }
}
