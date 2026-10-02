import { z } from "zod";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { isImpersonating } from "@/lib/impersonation";
import { REQUEST_AREAS, createFeatureRequest, type RequestArea } from "@/lib/support";

/** Request a feature. Admins are emailed. */
export const POST = route(async ({ workspace, user, request }) => {
  if (await isImpersonating()) throw new AuthError("Support sessions can't request features for the customer.", 403);
  const body = await parseBody(
    request,
    z.object({
      title: z.string().trim().min(3, "Add a short title.").max(100),
      area: z.enum(Object.keys(REQUEST_AREAS) as [RequestArea, ...RequestArea[]]).default("other"),
      problem: z.string().trim().min(10, "Tell us the problem in a sentence or two.").max(4000),
      outcome: z.string().trim().max(4000).optional(),
    }),
  );
  const created = await createFeatureRequest({ workspace, user }, body);
  return ok({ request: { id: created.id } });
});
