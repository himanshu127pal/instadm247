import { GUIDE, type GuideSection } from "@/lib/helper/guide";

/**
 * Public documentation, built from the AI Helper's product guide
 * (src/lib/helper/guide.ts). One source on purpose: the guide is kept true to
 * the UI by CLAUDE.md rule 14, so the docs are too, and the docs and the
 * helper can never disagree.
 */

export type DocGroup = { title: string; slugs: string[] };

export const DOC_GROUPS: DocGroup[] = [
  { title: "Getting started", slugs: ["basics", "connect"] },
  { title: "Automations", slugs: ["automations", "editor", "builder", "recipes", "content"] },
  { title: "Messaging", slugs: ["inbox", "broadcasts", "planner", "scheduler"] },
  { title: "Audience", slugs: ["contacts", "forms", "bio", "templates"] },
  { title: "AI and insights", slugs: ["ai-agent", "analytics"] },
  { title: "Account and safety", slugs: ["safety", "developers", "billing", "support"] },
];

export type Doc = GuideSection & { slug: string; summary: string; group: string };

/** Where a section's first sentence doesn't stand on its own as a summary. */
const SUMMARY: Record<string, string> = {
  templates: "Saved replies, tracked links, coupon pools and the other reusable pieces your automations use.",
};

/** The docs that exist. Billing is hidden while plans aren't on sale. */
export function allDocs(opts: { billingEnabled: boolean }): Doc[] {
  const byId = new Map(GUIDE.map((s) => [s.id, s]));
  return DOC_GROUPS.flatMap((group) =>
    group.slugs
      .filter((slug) => byId.has(slug) && (slug !== "billing" || opts.billingEnabled))
      .map((slug) => {
        const section = byId.get(slug)!;
        return { ...section, slug, group: group.title, summary: SUMMARY[slug] ?? summarise(section.body) };
      }),
  );
}

/** The first sentence, without markup: for cards and meta descriptions. */
function summarise(body: string): string {
  const first = plain(body.split("\n").find((l) => l.trim()) ?? "");
  const sentence = first.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? first;
  return sentence.length > 160 ? `${sentence.slice(0, 157).replace(/\s+\S*$/, "")}…` : sentence;
}

export function plain(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: Array<{ text: string; children: string[] }> };

/**
 * The guide's light markdown, as blocks: paragraphs, "- " lists, "1. " lists,
 * and indented sub-items. Inline **bold** and links are rendered by
 * renderInline, which only allows internal and https links.
 */
export function parseDoc(body: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const item = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
      continue;
    }
    if (item) {
      flush();
      const [, indent, marker, text] = item;
      const kind = marker === "-" ? "ul" : "ol";
      const last = blocks.at(-1);
      if (indent.length >= 2 && last && last.kind !== "p" && last.items.length) {
        last.items.at(-1)!.children.push(text);
      } else if (last && last.kind === kind) {
        last.items.push({ text, children: [] });
      } else {
        blocks.push({ kind, items: [{ text, children: [] }] });
      }
      continue;
    }
    const last = blocks.at(-1);
    if (/^\s{2,}/.test(raw) && last && last.kind !== "p" && last.items.length) {
      // A continuation line of a list item.
      last.items.at(-1)!.text += ` ${line.trim()}`;
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
