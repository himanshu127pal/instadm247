import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AdminAccessError, audit, requirePlatformStaff } from "@/lib/admin";
import { notifyPlanGranted } from "@/lib/email/notify";
import { recomputeWorkspacePlan } from "@/lib/billing/resolve";
import { DodoError, cancelNow, createRefund, fetchSubscription, scheduleCancel } from "@/lib/billing/dodo";
import { formatMinor, prepareAnnualRefund } from "@/lib/billing/refund";
import { planFor } from "@/lib/billing/plans";
import { emailWorkspaceOwner } from "@/lib/email/send";
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
  z.object({
    action: z.literal("refund_quote"),
    workspaceId: z.string().min(1),
    subscriptionId: z.string().min(1),
    /** When the customer's request reached support. Defaults to now. */
    requestedAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("refund_annual"),
    workspaceId: z.string().min(1),
    subscriptionId: z.string().min(1),
    requestedAt: z.string().datetime().optional(),
    /** The amount the preview showed — refused if the numbers moved since. */
    expectedAmount: z.number().int().positive(),
    reason,
  }),
]);

/**
 * Staff billing actions. Every one is audited before it runs.
 *
 *   override / clear_override / cancel — admin only: they change what a
 *     customer pays for or receives.
 *   refund_quote — support too: it only reads our records and does the sums.
 *   refund_annual — admin only: money leaves. See docs/BILLING.md §Refunds.
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
    const staff = await requirePlatformStaff(
      body.action === "resync" || body.action === "refund_quote" ? "support" : "admin",
    );

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

      case "refund_quote": {
        const at = requestDate(body.requestedAt);
        if (!at) return NextResponse.json({ error: "The request date can't be in the future." }, { status: 400 });
        const prepared = await prepareAnnualRefund(workspace.id, body.subscriptionId, at);
        if (!prepared.ok) return NextResponse.json({ error: prepared.reason }, { status: 409 });
        return NextResponse.json({
          ok: true,
          quote: {
            paid: formatMinor(prepared.paid, prepared.currency),
            refund: formatMinor(prepared.amount, prepared.currency),
            amount: prepared.amount,
            monthsUsed: prepared.monthsUsed,
            monthsUnused: prepared.monthsUnused,
            paymentId: prepared.paymentId,
            refundAlreadyIssued: prepared.refundAlreadyIssued,
          },
        });
      }

      case "refund_annual": {
        const at = requestDate(body.requestedAt);
        if (!at) return NextResponse.json({ error: "The request date can't be in the future." }, { status: 400 });
        const prepared = await prepareAnnualRefund(workspace.id, body.subscriptionId, at);
        if (!prepared.ok) return NextResponse.json({ error: prepared.reason }, { status: 409 });
        if (prepared.amount !== body.expectedAmount) {
          return NextResponse.json(
            { error: "The refund amount changed since the preview. Preview it again before refunding." },
            { status: 409 },
          );
        }

        const refundText = formatMinor(prepared.amount, prepared.currency);
        await audit({
          actorUserId: staff.id,
          action: "billing.refund",
          targetType: "workspace",
          targetId: workspace.id,
          reason: body.reason,
          meta: {
            subscriptionId: body.subscriptionId,
            paymentId: prepared.paymentId,
            amount: prepared.amount,
            currency: prepared.currency,
            monthsUsed: prepared.monthsUsed,
            requestedAt: at.toISOString(),
          },
        });

        // Refund first, then end the plan. If the cancel fails the customer
        // has their money and keeps the plan until it's retried — never the
        // other way round. A retry sees our recorded refund and skips it.
        if (!prepared.refundAlreadyIssued) {
          try {
            const refund = await createRefund({
              paymentId: prepared.paymentId,
              productId: prepared.productId,
              amount: prepared.amount,
              reason: `Annual plan refund, ${prepared.monthsUsed} months used at the monthly price. ${body.reason}`,
            });
            await traceOutbound("refund.create", {
              workspaceId: workspace.id,
              providerSubscriptionId: body.subscriptionId,
              providerPaymentId: prepared.paymentId,
              amount: prepared.amount,
              currency: prepared.currency,
              status: "ok",
              note: `By staff: ${refundText}, ${prepared.monthsUsed} months used at the monthly price (${refund.status})`,
              payload: refund,
            });
          } catch (error) {
            await traceOutbound("refund.create", {
              workspaceId: workspace.id,
              providerSubscriptionId: body.subscriptionId,
              providerPaymentId: prepared.paymentId,
              amount: prepared.amount,
              currency: prepared.currency,
              status: "failed",
              error: (error as Error).message,
            });
            throw error;
          }
        }

        try {
          await cancelNow(body.subscriptionId, `Annual plan refunded (${prepared.monthsUsed} months used): ${body.reason}`);
          await traceOutbound("subscription.cancel_now", {
            workspaceId: workspace.id,
            providerSubscriptionId: body.subscriptionId,
            status: "ok",
            note: "By staff, immediately, with a refund",
          });
        } catch (error) {
          await traceOutbound("subscription.cancel_now", {
            workspaceId: workspace.id,
            providerSubscriptionId: body.subscriptionId,
            status: "failed",
            error: (error as Error).message,
          });
          return NextResponse.json(
            {
              error: `The refund of ${refundText} was issued, but ending the subscription failed (${(error as Error).message}). Run the refund again. It won't refund twice, it will only retry the cancel.`,
            },
            { status: 502 },
          );
        }

        await emailWorkspaceOwner(
          workspace.id,
          "refund_issued",
          { plan: planFor(prepared.planKey).name, amount: refundText, monthsUsed: prepared.monthsUsed },
          `refund:${prepared.paymentId}`,
        );
        // Dodo confirms with refund and subscription.cancelled webhooks; the
        // latter moves the workspace to Free.
        return NextResponse.json({ ok: true, refund: refundText });
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

/** The date a refund request arrived: given, or now. Null if in the future. */
function requestDate(value: string | undefined): Date | null {
  const now = new Date();
  if (!value) return now;
  const at = new Date(value);
  return at.getTime() > now.getTime() + 60_000 ? null : at;
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
