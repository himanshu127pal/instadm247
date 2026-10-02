import { prisma } from "@/lib/db";
import { normalizeTag } from "@/lib/tags";

export { normalizeTag };

/** The most contacts one tag change can touch. */
export const MAX_TAG_BATCH = 500;

/**
 * Add and remove tags on contacts by hand, from the Contacts page. Only the
 * workspace's own contacts are touched; ids from anywhere else are ignored.
 * Returns how many contacts changed.
 */
export async function updateContactTags(
  workspaceId: string,
  contactIds: string[],
  change: { add?: string[]; remove?: string[] },
): Promise<number> {
  const add = [...new Set((change.add ?? []).map(normalizeTag).filter(Boolean))];
  // Removal matches the tag exactly as stored, whatever made it.
  const remove = new Set((change.remove ?? []).filter((t) => t.length > 0));
  if (add.length === 0 && remove.size === 0) return 0;

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds.slice(0, MAX_TAG_BATCH) }, account: { workspaceId } },
    select: { id: true, tags: true },
  });

  let changed = 0;
  await prisma.$transaction(
    contacts.flatMap((contact) => {
      const next = [...contact.tags.filter((t) => !remove.has(t)), ...add.filter((t) => !contact.tags.includes(t))];
      if (next.length === contact.tags.length && next.every((t, i) => t === contact.tags[i])) return [];
      changed++;
      return [prisma.contact.update({ where: { id: contact.id }, data: { tags: next } })];
    }),
  );
  return changed;
}
