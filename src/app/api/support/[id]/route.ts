import { z } from "zod";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { isImpersonating } from "@/lib/impersonation";
import { customerReply, setTicketStatus } from "@/lib/support";

/** Add to your ticket. Staff are emailed. */
export const POST = route<{ id: string }>(async ({ workspace, user, request, params }) => {
  if (await isImpersonating()) throw new AuthError("Support sessions can't reply as the customer.", 403);
  const { body } = await parseBody(request, z.object({ body: z.string().trim().min(1, "Write a reply first.").max(5000) }));
  await customerReply({ workspace, user }, params.id, body);
  return ok();
});

/** Close your ticket, or reopen it. */
export const PATCH = route<{ id: string }>(async ({ workspace, request, params }) => {
  const { status } = await parseBody(request, z.object({ status: z.enum(["closed", "open"]) }));
  await setTicketStatus(params.id, status, workspace.id);
  return ok();
});
