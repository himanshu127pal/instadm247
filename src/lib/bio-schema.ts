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
  accountId: z.string().nullable().optional(),
  blocks: z.array(bioBlockSchema).max(50).default([]),
});
