/**
 * Public content pages, run from e2e-check.ts: every internal link resolves,
 * the sitemap lists every page, and content can't inject a script link.
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FEATURES } from "../src/content/features";
import { COMPARISONS } from "../src/content/compare";
import { POSTS } from "../src/content/blog";
import { renderInline } from "../src/components/marketing/content";
import sitemap from "../src/app/sitemap";
import { allDocs, parseDoc, plain } from "../src/content/docs";
import { searchDocs } from "../src/components/marketing/docs-search";
import { GUIDE } from "../src/lib/helper/guide";
import { env } from "../src/lib/env";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

export async function runContentChecks(check: Check, section: Section) {
  section("Content pages");

  const routes = new Set<string>([
    "/", "/features", "/compare", "/blog", "/signup", "/login", "/privacy", "/terms", "/refunds", "/data-deletion",
    ...FEATURES.map((f) => `/features/${f.slug}`),
    ...COMPARISONS.map((c) => `/compare/${c.slug}`),
    ...POSTS.map((p) => `/blog/${p.slug}`),
    "/docs",
    ...allDocs({ billingEnabled: env.billing.enabled }).map((d) => `/docs/${d.slug}`),
  ]);

  const docs = allDocs({ billingEnabled: true });
  const grouped = new Set(docs.map((d) => d.slug));
  const ungrouped = GUIDE.filter((g) => !grouped.has(g.id)).map((g) => g.id);
  check("every section of the product guide is in the docs", ungrouped.length === 0, ungrouped.join(", "));
  check("billing docs are hidden while plans aren't on sale", !allDocs({ billingEnabled: false }).some((d) => d.slug === "billing"));
  check("every doc has a summary for its card and search result", docs.every((d) => d.summary.length > 20 && !d.summary.includes("**")), docs.find((d) => d.summary.length <= 20)?.slug);
  const lists = parseDoc("Intro line.\n1. One\n   - nested\n2. Two\n- dash");
  check(
    "doc markdown becomes paragraphs, numbered and bulleted lists with sub-items",
    lists.length === 3 && lists[1].kind === "ol" && lists[1].items.length === 2 && lists[1].items[0].children[0] === "nested" && lists[2].kind === "ul",
    JSON.stringify(lists),
  );
  const searchable = docs.map((d) => ({ slug: d.slug, title: d.title, summary: d.summary, group: d.group, text: plain(d.body) }));
  const found = searchDocs(searchable, "story react").map((d) => d.slug);
  check("docs search needs every word, and finds the scheduler for 'schedule'", found.length > 0 && found.length < docs.length && searchDocs(searchable, "schedule")[0]?.slug === "scheduler", found.join());
  check("plain text drops markup", plain("**Bold** and *soft* [link](/docs)") === "Bold and soft link");

  const unique = (xs: string[]) => new Set(xs).size === xs.length;
  check("feature, comparison and post slugs are unique", unique(FEATURES.map((f) => f.slug)) && unique(COMPARISONS.map((c) => c.slug)) && unique(POSTS.map((p) => p.slug)));

  const badRelated = FEATURES.flatMap((f) => f.related.filter((r) => !routes.has(`/features/${r}`)).map((r) => `${f.slug} → ${r}`));
  check("every 'works well with' link points at a real feature", badRelated.length === 0, badRelated.join(", "));

  const text = POSTS.flatMap((p) =>
    p.body.flatMap((b) => ("p" in b ? [b.p] : "ul" in b ? b.ul : "ol" in b ? b.ol : "callout" in b ? [b.callout.body] : [])),
  );
  const internal = text.flatMap((t) => [...t.matchAll(/\]\((\/[^)\s#]*)/g)].map((m) => m[1]));
  const broken = internal.filter((href) => !routes.has(href));
  check("every link inside a blog post resolves", broken.length === 0, broken.join(", "));

  const tooLong = [...FEATURES.map((f) => f.description), ...COMPARISONS.map((c) => c.description), ...POSTS.map((p) => p.description)]
    .filter((d) => d.length > 170);
  check("meta descriptions stay short enough to show in results", tooLong.length === 0, tooLong[0]);

  const listed = new Set(sitemap().map((e) => new URL(e.url).pathname));
  const missing = [...routes].filter((r) => !["/login"].includes(r) && !listed.has(r));
  check("the sitemap lists every public page", missing.length === 0, missing.join(", "));

  const html = renderToStaticMarkup(<>{renderInline("[click](javascript:alert(1)) and [ok](/blog) **bold**")}</>);
  check(
    "content links are internal or https only — never javascript:",
    !html.includes("javascript:") && html.includes('href="/blog"') && html.includes("<strong>bold</strong>"),
  );

  check(
    "comparisons never mark a competitor ✗ — only 'not listed'",
    COMPARISONS.every((c) => c.rows.every((r) => r.them !== false)),
  );
}
