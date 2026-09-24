import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AdminAccessError, audit, requirePlatformStaff } from "@/lib/admin";
import { notifyPlanGranted } from "@/lib/email/notify";
import { recomputeWorkspacePlan } from "@/lib/billing/resolve";
import { DodoError, fetchSubscription, scheduleCancel } from "@/lib/billing/dodo";
import { applySubscription } from "@/lib/billing/webhook";
import { traceOutbound } from "@/lib/billing/trace";

export const runtime = "nodejs";

const reason = z.string().trim().min(10, "Give a reason of at least 10 characters.").max(500);

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("override"),
    workspaceId: z.string().min(1),
    plan: z.enum(["free", "pro", "business", "unlimited"]),
    until: z.string().datetime().optional(),
    /** Email the customer. Off for grants that are internal, like test accounts. */
    notify: z.boolean().optional().default(true),
    reason,
  }),
  z.object({ action: z.literal("clear_override"), workspaceId: z.string().min(1), reason }),
  z.object({ action: z.literal("resync"), workspaceId: z.string().min(1), subscriptionId: z.string().min(1) }),
  z.object({
    action: z.literal("cancel"),
    workspaceId: z.string().min(1),
    subscriptionId: z.string().min(1),
    reason,
  }),
]);

/**
 * Staff billing actions. Every one is audited before it runs.
 *
 *   override / clear_override / cancel — admin only: they change what a
 *     customer pays for or receives.
 *   resync — support too: it only pulls Dodo's own record and applies it, so it
 *     can't grant anything that isn't real, and it's the first thing to try on
 *     a "I paid but I'm still on Free" ticket.
 */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Bad request" },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const staff = await requirePlatformStaff(body.action === "resync" ? "support" : "admin");

    const workspace = await prisma.workspace.findUnique({
      where: { id: body.workspaceId },
      select: { id: true, planKey: true },
    });
    if (!workspace) return NextResponse.json({ error: "No such customer." }, { status: 404 });

    switch (body.action) {
      case "override": {
        const until = body.until ? new Date(body.until) : null;
        if (until && until <= new Date()) {
          return NextResponse.json({ error: "The end date must be in the future." }, { status: 400 });
        }
        await audit({
          actorUserId: staff.id,
          action: "billing.override",
          targetType: "workspace",
          targetId: workspace.id,
          reason: body.reason,
          meta: { plan: body.plan, until: until?.toISOString() ?? null, planBefore: workspace.planKey },
        });
        await prisma.workspace.update({
          where: { id: workspace.id },
          data: {
            planOverride: body.plan,
            planOverrideReason: body.reason,
            planOverrideUntil: until,
            planOverrideById: staff.id,
          },
        });
        const change = await recomputeWorkspacePlan(workspace.id);
        // Only when it actually raised their plan — a grant under what they
        // already pay for changes nothing they'd notice.
        if (body.notify && change && change.before !== change.after) {
          await notifyPlanGranted(workspace.id, change.after, until, new Date()).catch((error) =>
            console.error("[admin] plan granted email failed", error),
          );
        }
        return NextResponse.json({ ok: true, plan: change?.after });
      }

      case "clear_override": {
        await audit({
          actorUserId: staff.id,
          action: "billing.override.clear",
          targetType: "workspace",
          targetId: workspace.id,
          reason: body.reason,
          meta: { planBefore: workspace.planKey },
        });
        await prisma.workspace.update({
          where: { id: workspace.id },
          data: { planOverride: null, planOverrideReason: null, planOverrideUntil: null, planOverrideById: null },
        });
        const change = await recomputeWorkspacePlan(workspace.id);
        return NextResponse.json({ ok: true, plan: change?.after });
      }

      case "resync": {
        await assertOwnSubscription(workspace.id, body.subscriptionId);
        await audit({
          actorUserId: staff.id,
          action: "billing.resync",
          targetType: "workspace",
          targetId: workspace.id,
          meta: { subscriptionId: body.subscriptionId },
        });
        const sub = await fetchSubscription(body.subscriptionId);
        // Dodo's record is current as of now, so it is applied as the newest event.
        const result = await applySubscription(workspace.id, sub, new Date());
        await traceOutbound("subscription.resync", {
          workspaceId: workspace.id,
          providerSubscriptionId: body.subscriptionId,
          providerCustomerId: sub.customer?.customer_id ?? null,
          status: result.kind === "applied" ? "ok" : "failed",
          note: result.kind === "applied" ? `By staff: ${result.note}` : null,
          error: result.kind === "unknown_product" ? `Unknown product ${result.productId}` : null,
          payload: sub,
        });
        if (result.kind === "unknown_product") {
          return NextResponse.json(
            { error: `Dodo reports product ${result.productId}, which isn't mapped to a plan.` },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true, note: result.kind === "applied" ? result.note : "" });
      }

      case "cancel": {
        await assertOwnSubscription(workspace.id, body.subscriptionId);
        await audit({
          actorUserId: staff.id,
          action: "billing.cancel",
          targetType: "workspace",
          targetId: workspace.id,
          reason: body.reason,
          meta: { subscriptionId: body.subscriptionId },
        });
        try {
          // At period end, never immediately: the customer keeps what they paid
          // for. Refunds are done in Dodo's dashboard, where the money is.
          await scheduleCancel(body.subscriptionId, `By InstaDM247 staff: ${body.reason}`);
          await traceOutbound("subscription.cancel", {
            workspaceId: workspace.id,
            providerSubscriptionId: body.subscriptionId,
            status: "ok",
            note: `By staff, at period end: ${body.reason}`,
          });
        } catch (error) {
          await traceOutbound("subscription.cancel", {
            workspaceId: workspace.id,
            providerSubscriptionId: body.subscriptionId,
            status: "failed",
            error: (error as Error).message,
          });
          throw error;
        }
        // Dodo confirms with a subscription.updated webhook, which updates the
        // record; nothing is changed locally ahead of that.
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    if (error instanceof OwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DodoError) {
      // Staff see the provider's words — they need them to act.
      return NextResponse.json({ error: `Dodo: ${error.message}` }, { status: 502 });
    }
    console.error("[admin] billing action failed", error);
    return NextResponse.json({ error: "The billing action failed." }, { status: 500 });
  }
}

class OwnershipError extends Error {}

/** A subscription ID in the request must belong to the workspace in the request. */
async function assertOwnSubscription(workspaceId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { providerSubscriptionId: subscriptionId, workspaceId },
    select: { id: true },
  });
  if (!sub) throw new OwnershipError("That subscription doesn't belong to this customer.");
}
