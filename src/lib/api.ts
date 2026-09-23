import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireWorkspace } from "./auth";
import { prisma } from "./db";
import { MetaApiError } from "./meta/types";
import { PlanLimitError } from "./plan";
import { DodoError } from "./billing/dodo";

/**
 * Shared plumbing for dashboard API routes: consistent auth, consistent error
 * shapes, and workspace scoping that can't be forgotten.
 */

export type Handler<T> = (ctx: {
  workspace: { id: string; name: string; planKey: string };
  user: { id: string; email: string; emailVerified: boolean };
  request: Request;
  params: T;
}) => Promise<NextResponse | Response>;

/**
 * Next.js 15 validates the exported handler's signature, so the context
 * argument must be required and carry a `params` promise — even for routes
 * with no dynamic segments, where it resolves to an empty object.
 */
export function route<T = Record<string, never>>(handler: Handler<T>) {
  return async (request: Request, context: { params: Promise<T> }) => {
    try {
      const { user, workspace } = await requireWorkspace();
      const params = ((await context?.params) ?? {}) as T;
      return await handler({ workspace, user, request, params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof MetaApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof DodoError) {
    // Never pass the provider's raw message to a customer: it can describe our
    // account and configuration. The trace has the detail.
    console.error("[billing] provider call failed", error.message);
    return NextResponse.json(
      { error: "The payment provider couldn't complete that. Please try again in a moment." },
      { status: 502 },
    );
  }
  if (error instanceof PlanLimitError) {
    // 402, with the plan that would unlock it, so the dashboard can offer the
    // upgrade in place rather than just showing an error.
    return NextResponse.json(
      { error: error.message, upgradeTo: error.upgradeTo },
      { status: 402 },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid request", issues: error.issues },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json({ error: "Something went wrong on our end." }, { status: 500 });
}

/**
 * Confirm an Instagram account belongs to the caller's workspace. Every route
 * that takes an accountId must go through this.
 */
export async function assertAccount(workspaceId: string, accountId: string) {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, workspaceId },
  });
  if (!account) throw new AuthError("That Instagram account isn't in this workspace.", 404);
  return account;
}

export async function assertAutomation(workspaceId: string, automationId: string) {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, account: { workspaceId } },
    include: { flow: true, account: true, media: true },
  });
  if (!automation) throw new AuthError("Automation not found.", 404);
  return automation;
}

export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  const json = await request.json().catch(() => {
    throw new AuthError("Expected a JSON body.", 400);
  });
  return schema.parse(json);
}

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data);
}

/**
 * Quote anything that could break a CSV parser, and neutralise formula
 * injection so a value like `=cmd|...` can't execute when opened in Excel.
 */
export function csvCell(value: string): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
