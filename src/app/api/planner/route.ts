import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { assertAccount, assertAutomation, ok, parseBody, route } from "@/lib/api";
import { generateDraftCode, scanPlannedAutomations } from "@/lib/engine/planner";

export const runtime = "nodejs";

const createSchema = z.object({
  accountId: z.string().min(1),
  automationId: z.string().min(1),
  name: z.string().min(1).max(120),
});

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, createSchema);
  await assertAccount(workspace.id, body.accountId);
  await assertAutomation(workspace.id, body.automationId);

  // Codes are per account and unique; retry on the rare collision.
  let planned = null;
  for (let attempt = 0; attempt < 5 && !planned; attempt++) {
    const draftCode = generateDraftCode();
    planned = await prisma.plannedAutomation
      .create({
        data: {
          accountId: body.accountId,
          automationId: body.automationId,
          name: body.name,
          draftCode,
          // Give up watching after 30 days so stale plans don't linger forever.
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      })
      .catch(() => null);
  }
  if (!planned) throw new AuthError("Could not generate a unique draft code — try again.", 500);

  // The automation stays off until its post goes live.
  await prisma.automation.update({
    where: { id: body.automationId },
    data: { enabled: false },
  });

  return ok({ planned });
});

/** Scan now instead of waiting for the five-minute maintenance job. */
export const PUT = route(async () => {
  const result = await scanPlannedAutomations();
  return ok(result);
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1) }));

  const planned = await prisma.plannedAutomation.findFirst({
    where: { id, account: { workspaceId: workspace.id } },
  });
  if (!planned) throw new AuthError("Not found.", 404);

  await prisma.plannedAutomation.delete({ where: { id } });
  return ok();
});
