import { z } from "zod";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { isImpersonating } from "@/lib/impersonation";
import { TICKET_CATEGORIES, createTicket, type TicketCategory } from "@/lib/support";

/** Open a support ticket. Staff are emailed. */
export const POST = route(async ({ workspace, user, request }) => {
  // A support session is staff looking in; a ticket has to come from the customer.
  if (await isImpersonating()) throw new AuthError("Support sessions can't open tickets for the customer.", 403);
  const body = await parseBody(
    request,
    z.object({
      subject: z.string().trim().min(3, "Add a short subject.").max(120),
      category: z.enum(Object.keys(TICKET_CATEGORIES) as [TicketCategory, ...TicketCategory[]]).default("other"),
      body: z.string().trim().min(10, "Tell us a little more, at least a sentence.").max(5000),
    }),
  );
  const ticket = await createTicket({ workspace, user }, body);
  return ok({ ticket: { id: ticket.id } });
});
