import { prisma } from "@/lib/db";

/**
 * Link-in-Bio addresses (`/l/<slug>`). One set of rules, used both while the
 * customer types and when they save, so the live check can't promise a link
 * that saving then refuses.
 */

export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const SLUG_MIN = 2;
export const SLUG_MAX = 40;

/**
 * Names nobody gets: ours, and words a visitor would read as official — a
 * page at /l/support or /l/instadm247 could be used to impersonate us.
 */
const RESERVED = new Set([
  "instadm247", "instadm", "admin", "administrator", "support", "help", "official",
  "billing", "payments", "security", "login", "signin", "signup", "account", "api",
  "app", "dashboard", "settings", "www", "mail", "team", "staff", "meta", "instagram",
]);

export type SlugCheck = { available: true } | { available: false; reason: string };

/** Format and reservation only — no database. */
export function checkSlugFormat(slug: string): SlugCheck {
  if (slug.length < SLUG_MIN) return { available: false, reason: `Use at least ${SLUG_MIN} characters.` };
  if (slug.length > SLUG_MAX) return { available: false, reason: `Use at most ${SLUG_MAX} characters.` };
  if (!SLUG_PATTERN.test(slug)) return { available: false, reason: "Use lowercase letters, numbers and hyphens only." };
  if (slug.startsWith("-") || slug.endsWith("-")) return { available: false, reason: "It can't start or end with a hyphen." };
  if (RESERVED.has(slug)) return { available: false, reason: "That link is reserved. Try another." };
  return { available: true };
}

/**
 * Full check. Slugs are global across every workspace; `pageId` is the page
 * being edited, which may of course keep its own link.
 */
export async function checkSlug(slug: string, pageId?: string | null): Promise<SlugCheck> {
  const format = checkSlugFormat(slug);
  if (!format.available) return format;
  const clash = await prisma.bioPage.findFirst({
    where: { slug, ...(pageId ? { NOT: { id: pageId } } : {}) },
    select: { id: true },
  });
  return clash ? { available: false, reason: `/l/${slug} is already taken.` } : { available: true };
}

/** A link made from a name: "rezora.ai" → "rezora-ai". May be empty. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX - 3)
    .replace(/-+$/, "");
}

/**
 * A free link to suggest for a new page: the name itself, or the name with
 * -2, -3… when that's taken (most often by the customer's own first page).
 * Empty if nothing nearby is free; they then type one.
 */
export async function suggestSlug(name: string): Promise<string> {
  const base = slugFromName(name);
  if (!base) return "";
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if ((await checkSlug(candidate)).available) return candidate;
  }
  return "";
}
