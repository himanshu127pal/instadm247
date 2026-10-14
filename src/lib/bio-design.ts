import { z } from "zod";

/**
 * How a link-in-bio page looks. See docs/BIO.md.
 *
 * `BioPage.theme` names the preset a page started from; `BioPage.design` holds
 * the customer's changes on top of it. A page saved before designs existed
 * has no `design`, and renders exactly as its preset, which is how it looked.
 *
 * Every value that reaches a style attribute is validated here (hex colours,
 * fonts from a fixed list, https images), so a saved design can't inject CSS.
 */

export const BIO_FONTS = {
  bangers: { label: "Bangers (comic)", css: "var(--font-display), Impact, sans-serif" },
  baloo: { label: "Baloo 2", css: "var(--font-heading), ui-rounded, sans-serif" },
  nunito: { label: "Nunito", css: "var(--font-sans), ui-rounded, sans-serif" },
  inter: { label: "Inter", css: "'Bio Inter', system-ui, sans-serif" },
  poppins: { label: "Poppins", css: "'Bio Poppins', system-ui, sans-serif" },
  montserrat: { label: "Montserrat", css: "'Bio Montserrat', system-ui, sans-serif" },
  spaceGrotesk: { label: "Space Grotesk", css: "'Bio Space Grotesk', system-ui, sans-serif" },
  archivoBlack: { label: "Archivo Black", css: "'Bio Archivo Black', Impact, sans-serif" },
  playfair: { label: "Playfair Display", css: "'Bio Playfair Display', Georgia, serif" },
  libreBaskerville: { label: "Libre Baskerville", css: "'Bio Libre Baskerville', Georgia, serif" },
  dmSerif: { label: "DM Serif Display", css: "'Bio DM Serif Display', Georgia, serif" },
  caveat: { label: "Caveat (handwritten)", css: "'Bio Caveat', cursive" },
} as const;
export type BioFont = keyof typeof BIO_FONTS;
const FONT_IDS = Object.keys(BIO_FONTS) as [BioFont, ...BioFont[]];

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a colour like #12110e");
const image = z
  .string()
  .max(500)
  .regex(/^https:\/\/\S+$/, "Use an https:// image link")
  .nullable();

export const designSchema = z.object({
  header: z.enum(["minimal", "banner", "portrait"]),
  coverUrl: image,
  avatarShape: z.enum(["circle", "rounded"]),
  avatarSize: z.number().int().min(64).max(160),
  avatarOutline: z.boolean(),
  bgType: z.enum(["solid", "gradient", "image"]),
  gradient: z.enum(["linear", "radial", "diagonal"]),
  bgImageUrl: image,
  bgStart: hex,
  bgEnd: hex,
  pattern: z.enum(["none", "halftone"]),
  text: hex,
  blockBg: hex,
  blockText: hex,
  accent: hex,
  accentText: hex,
  shadow: hex,
  radius: z.number().int().min(0).max(32),
  transparency: z.number().int().min(0).max(80),
  blockShadow: z.boolean(),
  blockOutline: z.boolean(),
  displayFont: z.enum(FONT_IDS),
  bodyFont: z.enum(FONT_IDS),
  titleSize: z.enum(["sm", "md", "lg"]),
  showShare: z.boolean(),
});
export type BioDesign = z.infer<typeof designSchema>;

/** Our comic look; the base every preset changes. */
const COMIC: BioDesign = {
  header: "minimal",
  coverUrl: null,
  avatarShape: "circle",
  avatarSize: 96,
  avatarOutline: true,
  bgType: "solid",
  gradient: "linear",
  bgImageUrl: null,
  bgStart: "#fffdf7",
  bgEnd: "#fff1c9",
  pattern: "halftone",
  text: "#12110e",
  blockBg: "#ffffff",
  blockText: "#12110e",
  accent: "#ffd23f",
  accentText: "#12110e",
  shadow: "#12110e",
  radius: 16,
  transparency: 0,
  blockShadow: true,
  blockOutline: true,
  displayFont: "bangers",
  bodyFont: "nunito",
  titleSize: "md",
  showShare: false,
};

const SOFT = { pattern: "none", blockShadow: false, blockOutline: false, avatarOutline: false } as const;

/**
 * Ready-made looks. The first five are the themes pages had before designs
 * existed: keep their ids and colours, or old pages change.
 */
export const BIO_PRESETS: Array<{ id: string; label: string; design: BioDesign }> = [
  { id: "comic", label: "Comic", design: COMIC },
  {
    id: "midnight",
    label: "Midnight",
    design: { ...COMIC, bgStart: "#14131a", bgEnd: "#2a2340", text: "#f7f6f2", blockBg: "#232130", blockText: "#f7f6f2", accent: "#c77dff", accentText: "#12110e", shadow: "#f7f6f2" },
  },
  { id: "punch", label: "Punch", design: { ...COMIC, bgStart: "#ff5d73", bgEnd: "#ff9f45", blockBg: "#fffdf7", accent: "#4cc9f0" } },
  { id: "mint", label: "Mint", design: { ...COMIC, bgStart: "#52d67a", bgEnd: "#c5f5d3", blockBg: "#fffdf7", accent: "#ffd23f" } },
  { id: "sky", label: "Sky", design: { ...COMIC, bgStart: "#4cc9f0", bgEnd: "#c9f0fc", blockBg: "#fffdf7", accent: "#ff9f45" } },
  {
    id: "blush",
    label: "Blush",
    design: {
      ...COMIC, ...SOFT, avatarOutline: true, bgType: "gradient", gradient: "diagonal",
      bgStart: "#f9e6d7", bgEnd: "#ffffff", text: "#6b4e45", blockBg: "#e6b89c", blockText: "#5a4038",
      accent: "#6b4e45", accentText: "#fbe9dc", shadow: "#e6b89c", radius: 8,
      displayFont: "libreBaskerville", bodyFont: "poppins", titleSize: "sm",
    },
  },
  {
    id: "clean",
    label: "Clean",
    design: {
      ...COMIC, ...SOFT, bgStart: "#f4f4f5", bgEnd: "#ffffff", text: "#18181b", blockBg: "#ffffff", blockText: "#18181b",
      accent: "#18181b", accentText: "#ffffff", shadow: "#d4d4d8", radius: 12, blockShadow: true,
      displayFont: "inter", bodyFont: "inter", titleSize: "sm",
    },
  },
  {
    id: "noir",
    label: "Noir",
    design: {
      ...COMIC, ...SOFT, blockOutline: true, bgStart: "#0a0a0a", bgEnd: "#262626", bgType: "gradient", gradient: "radial",
      text: "#fafafa", blockBg: "#0a0a0a", blockText: "#fafafa", accent: "#fafafa", accentText: "#0a0a0a", shadow: "#fafafa",
      radius: 0, displayFont: "spaceGrotesk", bodyFont: "spaceGrotesk", titleSize: "md",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    design: {
      ...COMIC, ...SOFT, bgType: "gradient", gradient: "diagonal", bgStart: "#e5484d", bgEnd: "#8e44ad",
      text: "#ffffff", blockBg: "#ffffff", blockText: "#2d1b3d", accent: "#2d1b3d", accentText: "#ffffff",
      shadow: "#2d1b3d", radius: 32, transparency: 10, blockShadow: true, displayFont: "poppins", bodyFont: "poppins",
    },
  },
  {
    id: "editorial",
    label: "Editorial",
    design: {
      ...COMIC, ...SOFT, blockOutline: true, bgStart: "#f6f1e7", bgEnd: "#ffffff", text: "#1f1a14", blockBg: "#f6f1e7",
      blockText: "#1f1a14", accent: "#1f1a14", accentText: "#f6f1e7", shadow: "#1f1a14", radius: 0, avatarShape: "rounded",
      header: "portrait", displayFont: "playfair", bodyFont: "libreBaskerville", titleSize: "lg",
    },
  },
  {
    id: "neon",
    label: "Neon",
    design: {
      ...COMIC, avatarOutline: true, pattern: "none", bgStart: "#111827", bgEnd: "#1f2937", text: "#e5ffe0", blockBg: "#111827",
      blockText: "#c6ff5e", accent: "#c6ff5e", accentText: "#111827", shadow: "#c6ff5e", radius: 12,
      displayFont: "archivoBlack", bodyFont: "montserrat",
    },
  },
];
export const PRESET_IDS = BIO_PRESETS.map((p) => p.id) as [string, ...string[]];

export function presetDesign(id: string): BioDesign {
  return (BIO_PRESETS.find((p) => p.id === id) ?? BIO_PRESETS[0]).design;
}

/**
 * The design to render: the preset, with whatever saved fields are still
 * valid on top. One bad field (from an older version, say) drops only that
 * field, never the page.
 */
export function resolveDesign(theme: string, saved: unknown): BioDesign {
  const base = presetDesign(theme);
  if (!saved || typeof saved !== "object") return base;
  const out: Record<string, unknown> = { ...base };
  const shape = designSchema.shape as Record<string, z.ZodTypeAny>;
  for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
    if (key in shape && shape[key].safeParse(value).success) out[key] = value;
  }
  return out as BioDesign;
}

/**
 * Whether a design differs from its preset in look. Your own pictures and the
 * share button aren't part of a preset, so they don't count.
 */
export function isCustomised(theme: string, design: BioDesign): boolean {
  const strip = ({ coverUrl: _c, bgImageUrl: _b, showShare: _s, ...look }: BioDesign) => look;
  return JSON.stringify(strip(design)) !== JSON.stringify(strip(presetDesign(theme)));
}

/** WCAG contrast ratio of two hex colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** A colour with an alpha, from #rrggbb and 0 to 1. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return `${color}${a}`;
}

// --- Links ---------------------------------------------------------------

export const SOCIAL_PLATFORMS = {
  instagram: { label: "Instagram", placeholder: "https://instagram.com/yourname" },
  tiktok: { label: "TikTok", placeholder: "https://tiktok.com/@yourname" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@yourname" },
  x: { label: "X", placeholder: "https://x.com/yourname" },
  linkedin: { label: "LinkedIn", placeholder: "https://linkedin.com/in/yourname" },
  facebook: { label: "Facebook", placeholder: "https://facebook.com/yourpage" },
  threads: { label: "Threads", placeholder: "https://threads.net/@yourname" },
  spotify: { label: "Spotify", placeholder: "https://open.spotify.com/artist/…" },
  pinterest: { label: "Pinterest", placeholder: "https://pinterest.com/yourname" },
  snapchat: { label: "Snapchat", placeholder: "https://snapchat.com/add/yourname" },
  twitch: { label: "Twitch", placeholder: "https://twitch.tv/yourname" },
  discord: { label: "Discord", placeholder: "https://discord.gg/invite" },
  telegram: { label: "Telegram", placeholder: "https://t.me/yourname" },
  whatsapp: { label: "WhatsApp", placeholder: "+1234567890" },
  email: { label: "Email", placeholder: "hello@example.com" },
  website: { label: "Website", placeholder: "https://example.com" },
} as const;
export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;

/**
 * Where a block goes when tapped, or null if it can't safely go anywhere.
 * Only http(s), mailto and wa.me: a `javascript:` link saved as a block must
 * never become a link on someone's public page.
 */
export function blockHref(kind: string, url: string | null, platform?: string): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  const asEmail = kind === "EMAIL" || (kind === "SOCIAL" && platform === "email");
  const asWhatsApp = kind === "WHATSAPP" || (kind === "SOCIAL" && platform === "whatsapp");
  if (asEmail) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.replace(/^mailto:/i, "")) ? `mailto:${value.replace(/^mailto:/i, "")}` : null;
  if (asWhatsApp) {
    const digits = value.replace(/[^\d]/g, "");
    return digits.length >= 6 ? `https://wa.me/${digits}` : null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// --- Starter templates -----------------------------------------------------

export type StarterBlock = { kind: string; label: string; url: string | null; subtitle: string | null; imageUrl: string | null; enabled: boolean };

const block = (kind: string, label: string, url: string | null = null, subtitle: string | null = null): StarterBlock => ({
  kind, label, url, subtitle, imageUrl: null, enabled: true,
});

/** What a new page can start from. Every link is a placeholder to replace. */
export const BIO_STARTERS: Array<{ id: string; label: string; description: string; preset: string; blocks: StarterBlock[] }> = [
  {
    id: "creator",
    label: "Creator",
    description: "Socials, your latest video and a newsletter",
    preset: "comic",
    blocks: [
      block("SOCIAL", "instagram", "https://instagram.com/"),
      block("SOCIAL", "youtube", "https://youtube.com/"),
      block("SOCIAL", "tiktok", "https://tiktok.com/"),
      block("LINK", "Watch my latest video", "https://youtube.com/", "New every week"),
      block("LINK", "Join my newsletter", "https://example.com/newsletter"),
      block("EMAIL", "Work with me", "hello@example.com", "Brand deals and collabs"),
    ],
  },
  {
    id: "shop",
    label: "Shop",
    description: "Best sellers up top, then the full store",
    preset: "blush",
    blocks: [
      block("SOCIAL", "instagram", "https://instagram.com/"),
      block("SOCIAL", "whatsapp", "+1234567890"),
      block("HEADING", "Best sellers"),
      block("PRODUCT", "Product one", "https://example.com/product-1", "$29"),
      block("PRODUCT", "Product two", "https://example.com/product-2", "$39"),
      block("LINK", "Shop everything", "https://example.com/shop"),
      block("WHATSAPP", "Questions? Message us", "+1234567890"),
    ],
  },
  {
    id: "coach",
    label: "Coach",
    description: "Book a call, free resource, testimonials",
    preset: "clean",
    blocks: [
      block("SOCIAL", "instagram", "https://instagram.com/"),
      block("SOCIAL", "linkedin", "https://linkedin.com/in/"),
      block("TEXT", "I help busy people get fit in 20 minutes a day."),
      block("LINK", "Book a free call", "https://example.com/book", "20 minutes, no pressure"),
      block("LINK", "Get my free guide", "https://example.com/guide"),
      block("LINK", "Client results", "https://example.com/results"),
    ],
  },
  { id: "blank", label: "Blank", description: "Start from nothing", preset: "comic", blocks: [] },
];
