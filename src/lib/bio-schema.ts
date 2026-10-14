import { z } from "zod";
import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@/lib/bio-slug";
import { blockHref, designSchema, PRESET_IDS, SOCIAL_PLATFORMS } from "@/lib/bio-design";

/** What saving a link-in-bio page accepts (POST /api/bio). */

export const bioBlockSchema = z
  .object({
    id: z.string().optional(),
    kind: z.enum(["LINK", "HEADING", "TEXT", "SOCIAL", "EMAIL", "WHATSAPP", "PRODUCT"]),
    /** For SOCIAL, the platform (a key of SOCIAL_PLATFORMS). */
    label: z.string().min(1).max(120),
    url: z.string().max(500).nullable().optional(),
    subtitle: z.string().max(160).nullable().optional(),
    imageUrl: z.string().max(500).nullable().optional(),
    enabled: z.boolean().default(true),
    /** The `key` of the tab it's on; null or missing is the home tab. */
    tab: z.string().max(64).nullable().optional(),
  })
  .superRefine((block, ctx) => {
    if (block.kind === "SOCIAL" && !(block.label in SOCIAL_PLATFORMS)) {
      ctx.addIssue({ code: "custom", path: ["label"], message: "Pick a social network" });
    }
    if (block.kind === "HEADING" || block.kind === "TEXT") return;
    // A link that can't safely open (javascript:, a typo) is refused here,
    // not silently dropped on the public page.
    if (block.url?.trim() && !blockHref(block.kind, block.url, block.label)) {
      const what = block.kind === "EMAIL" ? "an email address" : block.kind === "WHATSAPP" ? "a phone number" : "a web link";
      ctx.addIssue({ code: "custom", path: ["url"], message: `"${block.label}" needs ${what}` });
    }
  });

/** A tab's path segment: /l/<page>/<this>. */
export const TAB_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const MAX_TABS = 50;
export const MAX_BLOCKS_PER_TAB = 50;

export const bioTabSchema = z.object({
  id: z.string().optional(),
  /** The editor's handle on the tab, which blocks point at. */
  key: z.string().min(1).max(64),
  label: z.string().trim().min(1, "Give every tab a name").max(30, "Keep tab names to 30 characters"),
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(TAB_SLUG_PATTERN, "Tab links use lowercase letters, numbers and hyphens, and can't start or end with a hyphen"),
  enabled: z.boolean().default(true),
});

export const bioPageSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .min(SLUG_MIN)
    .max(SLUG_MAX)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens only"),
  title: z.string().min(1).max(80),
  bio: z.string().max(300).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  theme: z.enum(PRESET_IDS).default("comic"),
  design: designSchema.nullable().optional(),
  published: z.boolean().default(true),
  showBadge: z.boolean().default(true),
  /** Required: one page per Instagram account. Null only on an old page that has none. */
  accountId: z.string().nullable().optional(),
  homeLabel: z.string().trim().min(1).max(30).default("Home"),
  tabs: z.array(bioTabSchema).max(MAX_TABS, `A page can have up to ${MAX_TABS} tabs`).default([]),
  blocks: z.array(bioBlockSchema).max(MAX_BLOCKS_PER_TAB * (MAX_TABS + 1)).default([]),
}).superRefine((page, ctx) => {
  const keys = new Set<string>();
  const slugs = new Set<string>();
  for (const tab of page.tabs) {
    if (keys.has(tab.key)) ctx.addIssue({ code: "custom", path: ["tabs"], message: "Two tabs share a key" });
    if (slugs.has(tab.slug)) ctx.addIssue({ code: "custom", path: ["tabs"], message: `Two tabs use the link "${tab.slug}". Give each its own.` });
    keys.add(tab.key);
    slugs.add(tab.slug);
  }
  const perTab = new Map<string, number>();
  for (const block of page.blocks) {
    if (block.tab && !keys.has(block.tab)) ctx.addIssue({ code: "custom", path: ["blocks"], message: "A block is on a tab that doesn't exist" });
    if (block.tab && block.kind === "SOCIAL") ctx.addIssue({ code: "custom", path: ["blocks"], message: "Social icons go on the first tab" });
    const k = block.tab ?? "";
    perTab.set(k, (perTab.get(k) ?? 0) + 1);
  }
  if ([...perTab.values()].some((n) => n > MAX_BLOCKS_PER_TAB)) {
    ctx.addIssue({ code: "custom", path: ["blocks"], message: `A tab can have up to ${MAX_BLOCKS_PER_TAB} blocks` });
  }
});
