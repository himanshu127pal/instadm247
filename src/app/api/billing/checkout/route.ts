import { z } from "zod";
import { prisma } from "@/lib/db";
import { env, isBillingConfigured, isEmailConfigured } from "@/lib/env";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { isImpersonating } from "@/lib/impersonation";
import { getPlatformStaff } from "@/lib/admin";
import { createCheckout, ensureCustomer } from "@/lib/billing/dodo";

export const runtime = "nodejs";

const schema = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["month", "year"]),
});

/** Start a Dodo checkout for the current workspace. */
export const POST = route(async ({ workspace, user, request }) => {
  // A support session can look, not act — and this spends the customer's money.
  if (await isImpersonating()) {
    throw new AuthError("A support session can't start a purchase for the customer.", 403);
  }
  if (!isBillingConfigured()) {
    throw new AuthError("Upgrading isn't available right now. Please try again shortly.", 503);
  }
  // While billing is off, only staff may check out — that is how the flow is
  // tested end to end in Dodo's test mode before anyone is charged.
  if (!env.billing.enabled && !(await getPlatformStaff())) {
    throw new AuthError("Upgrading isn't available yet.", 403);
  }

  // Receipts, failed-payment warnings and renewal notices go to this address,
  // so it has to be one they can read. Only asked for when we can send the
  // verification email; otherwise it would be a wall with no door.
  if (isEmailConfigured() && !user.emailVerified) {
    throw new AuthError("Confirm your email first — use the link we sent you, or resend it from the banner above.", 403);
  }

  const { plan, interval } = await parseBody(request, schema);
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspace.id },
    select: { id: true, name: true, billingCustomerId: true },
  });
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, name: true },
  });

  const customerId = await ensureCustomer(ws, owner);
  const url = await createCheckout({
    workspaceId: ws.id,
    customerId,
    plan,
    interval,
    returnUrl: `${env.appUrl}/dashboard/billing?checkout=done`,
  });
  return ok({ url });
});
