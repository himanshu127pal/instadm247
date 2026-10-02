import { assertAccount, ok, route } from "@/lib/api";
import { syncAccount } from "@/lib/meta/account";

export const runtime = "nodejs";

/** Pull the latest profile and media into our cache. */
export const POST = route<{ id: string }>(async ({ workspace, params }) => {
  const account = await assertAccount(workspace.id, params.id);
  const result = await syncAccount(account.id);

  if (!result) {
    return Response.json(
      {
        error:
          "Couldn't sync with Instagram right now. If it keeps happening, reconnect this account.",
      },
      { status: 400 },
    );
  }

  return ok({ media: result.media });
});
