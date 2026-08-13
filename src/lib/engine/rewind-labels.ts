/**
 * Plain-language labels for why a comment isn't eligible for Rewind.
 *
 * Kept in its own module with no server-only imports so the client panel can
 * use them without pulling the engine — and BullMQ — into the browser bundle.
 */
export const REWIND_REASON_LABELS: Record<string, string> = {
  older_than_7_days: "Comment is more than 7 days old — Instagram won't allow a private reply",
  no_messageable_sender: "Instagram didn't give us a messageable ID for this commenter",
  your_own_comment: "Your own comment",
  keyword_did_not_match: "Comment didn't match this automation's keywords",
  already_replied: "This comment already received its one private reply",
  opted_out: "This person opted out",
  live_broadcast_ended: "Live comments can only be replied to during the broadcast",
};
