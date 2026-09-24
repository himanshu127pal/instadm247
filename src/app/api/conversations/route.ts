import { ok, route } from "@/lib/api";
import { listConversations } from "@/lib/inbox";

export const runtime = "nodejs";

/**
 * Conversations changed since `since` — the Inbox polls this to stay live.
 * `now` is taken before the query, so a change landing mid-request is picked
 * up next time rather than missed.
 */
export const GET = route(async ({ workspace, request }) => {
  const raw = new URL(request.url).searchParams.get("since");
  const since = raw ? new Date(raw) : undefined;
  const now = new Date();
  const conversations = await listConversations(
    workspace.id,
    since && !Number.isNaN(since.getTime()) ? since : undefined,
  );
  return ok({ conversations, now: now.toISOString() });
});
