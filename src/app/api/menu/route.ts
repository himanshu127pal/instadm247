import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertAccount, ok, parseBody, route } from "@/lib/api";
import { getClientForAccount } from "@/lib/meta/account";

export const runtime = "nodejs";

/**
 * DM Main Menu — Instagram's persistent menu. Always visible in the thread, so
 * it's the one piece of navigation a conversation never loses.
 */
const schema = z.object({
  accountId: z.string().min(1),
  enabled: z.boolean().default(true),
  items: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("web_url"),
          title: z.string().min(1).max(30),
          url: z.string().url(),
        }),
        z.object({
          type: z.literal("postback"),
          title: z.string().min(1).max(30),
          payload: z.string().min(1),
        }),
      ]),
    )
    .max(20),
});

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, schema);
  const account = await assertAccount(workspace.id, body.accountId);

  await prisma.persistentMenu.upsert({
    where: { accountId: account.id },
    create: { accountId: account.id, items: body.items as object[], enabled: body.enabled },
    update: { items: body.items as object[], enabled: body.enabled },
  });

  // Push to Instagram so it actually appears in the thread.
  const client = await getClientForAccount(account);
  if (client) {
    try {
      if (body.enabled && body.items.length > 0) {
        await client.setPersistentMenu(body.items);
      } else {
        await client.deleteMessengerProfile(["persistent_menu"]);
      }
    } catch (error) {
      return Response.json(
        { error: `Saved here, but Instagram rejected it: ${(error as Error).message}` },
        { status: 502 },
      );
    }
  }

  return ok();
});
