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

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

export async function runContentChecks(check: Check, section: Section) {
  section("Content pages");

  const routes = new Set<string>([
    "/", "/features", "/compare", "/blog", "/signup", "/login", "/privacy", "/terms", "/refunds", "/data-deletion",
    ...FEATURES.map((f) => `/features/${f.slug}`),
    ...COMPARISONS.map((c) => `/compare/${c.slug}`),
    ...POSTS.map((p) => `/blog/${p.slug}`),
  ]);

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
