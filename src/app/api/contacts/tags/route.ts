import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { MAX_TAG_BATCH, updateContactTags } from "@/lib/contacts";

/** Add or remove tags on one or many contacts, from the Contacts page. */
export const PATCH = route(async ({ workspace, request }) => {
  const body = await parseBody(
    request,
    z.object({
      contactIds: z.array(z.string().min(1)).min(1).max(MAX_TAG_BATCH),
      add: z.array(z.string().max(60)).max(20).optional(),
      remove: z.array(z.string().max(60)).max(20).optional(),
    }),
  );
  const changed = await updateContactTags(workspace.id, body.contactIds, body);
  return ok({ changed });
});
