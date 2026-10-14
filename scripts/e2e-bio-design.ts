/**
 * Link-in-bio designs: presets, saved designs, starter templates and safe
 * links. Run from e2e-check.ts.
 *
 * What these guard:
 * - pages saved before designs existed must look exactly as they did;
 * - a saved design reaches style attributes, so a bad value must never get
 *   through (CSS injection) and an old or broken field must drop alone;
 * - a block's link is someone's public page: `javascript:` must never be a
 *   link, on save or on render;
 * - every starter template must save as it is.
 */

import { BIO_FONTS, BIO_PRESETS, BIO_STARTERS, blockHref, contrastRatio, designSchema, isCustomised, presetDesign, resolveDesign } from "../src/lib/bio-design";
import { bioPageSchema } from "../src/lib/bio-schema";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

// The five themes as they were before designs: background, block, button, ink.
const LEGACY: Record<string, [string, string, string, string]> = {
  comic: ["#fffdf7", "#ffffff", "#ffd23f", "#12110e"],
  midnight: ["#14131a", "#232130", "#c77dff", "#f7f6f2"],
  punch: ["#ff5d73", "#fffdf7", "#4cc9f0", "#12110e"],
  mint: ["#52d67a", "#fffdf7", "#ffd23f", "#12110e"],
  sky: ["#4cc9f0", "#fffdf7", "#ff9f45", "#12110e"],
};

export function runBioDesignChecks(check: Check, section: Section) {
  section("Link in bio: designs");

  const legacyIntact = Object.entries(LEGACY).every(([id, [bg, panel, accent, ink]]) => {
    const d = resolveDesign(id, null);
    return d.bgType === "solid" && d.bgStart === bg && d.blockBg === panel && d.accent === accent && d.text === ink && d.blockText === ink && d.blockOutline && d.blockShadow && d.pattern === "halftone" && d.displayFont === "bangers";
  });
  check("a page saved before designs looks as it did (all five old themes)", legacyIntact);
  check("an unknown theme falls back to Comic", resolveDesign("gone", null).bgStart === "#fffdf7");
  check("every preset is a valid design", BIO_PRESETS.every((p) => designSchema.safeParse(p.design).success));
  check("preset ids are unique", new Set(BIO_PRESETS.map((p) => p.id)).size === BIO_PRESETS.length);

  const custom = { ...presetDesign("clean"), accent: "#ff0066", radius: 20 };
  check("a saved design comes back as saved", JSON.stringify(resolveDesign("clean", custom)) === JSON.stringify(custom));
  const hostile = resolveDesign("comic", {
    ...presetDesign("noir"),
    text: "red; background: url(https://evil.example/x)",
    displayFont: "Comic Sans MS",
    avatarSize: 9999,
    bgImageUrl: "javascript:alert(1)",
    surprise: "ignored",
  });
  check(
    "a bad field is dropped on its own, the rest of the design kept",
    hostile.text === presetDesign("comic").text && hostile.displayFont === "bangers" && hostile.avatarSize === 96 && hostile.bgImageUrl === null && hostile.blockBg === presetDesign("noir").blockBg && !("surprise" in hostile),
  );
  check("saving rejects a colour that isn't a colour", !designSchema.safeParse({ ...custom, blockBg: "#fff;}" }).success);
  check("saving rejects an image that isn't https", !designSchema.safeParse({ ...custom, coverUrl: "http://example.com/a.jpg" }).success);
  check("every font has a CSS stack", Object.values(BIO_FONTS).every((f) => f.css.length > 0));
  check("picking a theme and only adding a share button isn't 'customised'", !isCustomised("noir", { ...presetDesign("noir"), showShare: true }));
  check("changing a colour is 'customised'", isCustomised("noir", { ...presetDesign("noir"), accent: "#123456" }));

  section("Link in bio: safe links");
  check("javascript: never becomes a link", blockHref("LINK", "javascript:alert(1)") === null && blockHref("LINK", " JavaScript:alert(1)") === null);
  check("data: never becomes a link", blockHref("LINK", "data:text/html,<script>alert(1)</script>") === null);
  check("a bare domain gets https", blockHref("LINK", "example.com/shop") === "https://example.com/shop");
  check("an email block opens mail", blockHref("EMAIL", "hello@example.com") === "mailto:hello@example.com");
  check("a WhatsApp number becomes a wa.me link", blockHref("WHATSAPP", "+1 (234) 567-890") === "https://wa.me/1234567890");
  check("an email social icon opens mail", blockHref("SOCIAL", "me@example.com", "email") === "mailto:me@example.com");
  const save = (blocks: unknown[]) => bioPageSchema.safeParse({ slug: "e2e-design", title: "E2E", blocks });
  const bad = save([{ kind: "LINK", label: "Click", url: "javascript:alert(1)" }]);
  check("saving refuses a javascript: link, and says which block", !bad.success && bad.error.issues[0].message.includes("Click"));
  check("saving refuses a social icon for a network we don't know", !save([{ kind: "SOCIAL", label: "myspace", url: "https://myspace.com" }]).success);
  check("headings and text need no link", save([{ kind: "HEADING", label: "Hi" }, { kind: "TEXT", label: "Words" }]).success);

  section("Link in bio: starter templates");
  for (const starter of BIO_STARTERS) {
    const parsed = bioPageSchema.safeParse({ slug: "e2e-starter", title: "E2E", theme: starter.preset, blocks: starter.blocks });
    check(`the ${starter.label} template saves as it is`, parsed.success, parsed.success ? undefined : parsed.error.issues[0].message);
  }

  section("Link in bio: readability");
  check("black on white is the maximum contrast", Math.round(contrastRatio("#000000", "#ffffff")) === 21);
  check("every preset's block text is readable on its block", BIO_PRESETS.every((p) => contrastRatio(p.design.blockText, p.design.blockBg) >= 3));
  check("every preset's page text is readable on its background", BIO_PRESETS.every((p) => contrastRatio(p.design.text, p.design.bgStart) >= 3));
}
