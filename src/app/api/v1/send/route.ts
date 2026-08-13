import { z } from "zod";
import { prisma } from "@/lib/db";
import { publicRoute } from "@/lib/api-keys";
import { dispatch } from "@/lib/engine/dispatch";

export const runtime = "nodejs";

const schema = z.object({
  contact_id: z.string().min(1),
  text: z.string().min(1).max(1000),
});

/**
 * POST /api/v1/send — send a DM to one of your contacts.
 *
 * Goes through the same dispatcher as everything else, so the 24-hour window,
 * rate limits, Slow Down mode and opt-outs all still apply. A request that
 * would break Instagram's rules gets a 409 with the reason, not a silent drop.
 */
export const POST = publicRoute("write", async (ctx, request) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const contact = await prisma.contact.findFirst({
    where: { id: parsed.data.contact_id, account: { workspaceId: ctx.workspaceId } },
  });
  if (!contact) return Response.json({ error: "Contact not found." }, { status: 404 });

  const result = await dispatch({
    accountId: contact.accountId,
    contactId: contact.id,
    target: { to: "user", igsid: contact.igsid },
    message: { kind: "text", text: parsed.data.text },
    // Not "human" — an API call is automation, and must not get the
    // HUMAN_AGENT tag. See docs/META_API.md §6.
    source: "automation",
  });

  if (result.status === "skipped") {
    return Response.json({ error: result.explanation, reason: result.reason }, { status: 409 });
  }
  if (result.status === "failed") {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ id: result.messageId, status: "sent" });
});
