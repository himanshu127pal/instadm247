import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AuthError } from "@/lib/auth";
import { ok, route } from "@/lib/api";
import { isImpersonating } from "@/lib/impersonation";
import { createPortalSession } from "@/lib/billing/dodo";

export const runtime = "nodejs";

/**
 * Open Dodo's customer portal: invoices, card, cancel. Dodo hosts it, so card
 * details never touch this app.
 */
export const POST = route(async ({ workspace }) => {
  // The portal can cancel the subscription and change the card.
  if (await isImpersonating()) {
    throw new AuthError("A support session can't open the customer's billing portal.", 403);
  }
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspace.id },
    select: { billingCustomerId: true },
  });
  if (!ws.billingCustomerId) {
    throw new AuthError("There's no billing account yet — choose a plan first.", 400);
  }
  const url = await createPortalSession({
    workspaceId: workspace.id,
    customerId: ws.billingCustomerId,
    returnUrl: `${env.appUrl}/dashboard/billing`,
  });
  return ok({ url });
});
