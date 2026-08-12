import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertAccount, ok, parseBody, route } from "@/lib/api";
import { getClientForAccount } from "@/lib/meta/account";
import { armSlowDown, clearSlowDown } from "@/lib/engine/guards";

export const runtime = "nodejs";

const patchSchema = z.object({
  automationPaused: z.boolean().optional(),
  slowDown: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>(async ({ workspace, request, params }) => {
  const account = await assertAccount(workspace.id, params.id);
  const body = await parseBody(request, patchSchema);

  if (typeof body.slowDown === "boolean") {
    if (body.slowDown) {
      await armSlowDown(account.id, "Slow Down mode was switched on manually.");
    } else {
      await clearSlowDown(account.id);
    }
  }

  if (typeof body.automationPaused === "boolean") {
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: {
        automationPaused: body.automationPaused,
        pausedReason: body.automationPaused ? "Paused manually." : null,
      },
    });
  }

  const updated = await prisma.instagramAccount.findUnique({ where: { id: account.id } });
  return ok({ account: updated });
});

export const DELETE = route<{ id: string }>(async ({ workspace, params }) => {
  const account = await assertAccount(workspace.id, params.id);

  // Stop Instagram sending us events for an account we no longer hold data for.
  const client = await getClientForAccount(account);
  if (client) {
    await client.unsubscribeWebhooks().catch(() => undefined);
  }

  // Cascades remove automations, contacts, conversations, messages and stats.
  await prisma.instagramAccount.delete({ where: { id: account.id } });

  return ok();
});
