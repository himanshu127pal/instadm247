import type { Contact, InstagramAccount } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getClientForAccount } from "./account";

/**
 * Who someone is, from Instagram's User Profile API.
 *
 * A DM, story reply or reaction webhook carries only the sender's scoped ID
 * (IGSID): no username, no name. Comments carry the username, DMs don't. So a
 * person who first reaches us by DM would show in the Inbox as a number, and
 * `{{first_name}}` would be empty in their flow, unless we ask Instagram.
 *
 * `GET /<IGSID>?fields=name,username,profile_pic,...` on graph.instagram.com
 * with the account's token is documented for exactly this: the profile of a
 * person who messaged the business. Read-only, and it's the same call the
 * follower gate already makes, so it adds no new permission.
 */

/** After a failed lookup, don't ask again for this long. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/** A webhook is waiting on this; a slow Instagram must not hold up the flow. */
const TIMEOUT_MS = 3_000;

type Account = Pick<InstagramAccount, "id" | "igUserId" | "accessTokenEnc" | "status">;

/**
 * Whether this contact's profile should be looked up now: only when we don't
 * know their username. Commenters arrive with one, so a viral post's thousands
 * of comments cost no lookups; it's people who start with a DM who need it.
 */
export function profileNeedsLookup(contact: Pick<Contact, "username" | "followerCheckedAt">, now = Date.now()): boolean {
  if (contact.username) return false;
  const checked = contact.followerCheckedAt?.getTime();
  return !checked || now - checked > RETRY_AFTER_MS;
}

/**
 * Fill in a contact's username, name and photo from Instagram, if they're
 * missing or stale. Best effort: on any failure the contact comes back as it
 * was, and nothing that depends on it stops.
 */
export async function refreshContactProfile<C extends Contact>(account: Account, contact: C): Promise<C> {
  if (!profileNeedsLookup(contact)) return contact;
  const client = await getClientForAccount(account);
  if (!client) return contact;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const profile = await Promise.race([
      client.getUserProfile(contact.igsid),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("profile lookup timed out")), TIMEOUT_MS);
      }),
    ]);
    const data = {
      username: profile.username ?? contact.username,
      name: profile.name ?? contact.name,
      profilePicUrl: profile.profile_pic ?? contact.profilePicUrl,
      ...(typeof profile.is_user_follow_business === "boolean" ? { isFollower: profile.is_user_follow_business } : {}),
      ...(typeof profile.follower_count === "number" ? { followerCount: profile.follower_count } : {}),
      followerCheckedAt: new Date(),
    };
    await prisma.contact.update({ where: { id: contact.id }, data });
    return { ...contact, ...data };
  } catch (error) {
    // Logged without the person's ID: it's a third party's identifier.
    console.warn(`[profile] lookup failed for a contact of account ${account.id}: ${(error as Error).message}`);
    // Remember the attempt, so a failing lookup isn't retried on every
    // message. Safe for the follower gate: it re-checks while isFollower is
    // unknown, and for a contact with no username it always is.
    await prisma.contact
      .update({ where: { id: contact.id }, data: { followerCheckedAt: new Date() } })
      .catch(() => undefined);
    return contact;
  } finally {
    clearTimeout(timer);
  }
}
