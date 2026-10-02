import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/api";
import { isImpersonating } from "@/lib/impersonation";

/** Remember the tour is done (or bring it back), or hide the checklist. */
export const POST = route(async ({ user, request }) => {
  const body = await parseBody(
    request,
    z.object({ tour: z.enum(["done", "restart"]).optional(), checklist: z.enum(["dismiss", "show"]).optional() }),
  );
  // Staff looking in shouldn't change what the customer sees next time.
  if (await isImpersonating()) return ok();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.tour ? { tourCompletedAt: body.tour === "done" ? new Date() : null } : {}),
      ...(body.checklist ? { checklistDismissedAt: body.checklist === "dismiss" ? new Date() : null } : {}),
    },
  });
  return ok();
});
