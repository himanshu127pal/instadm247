import { env } from "@/lib/env";
import { POSTS } from "@/content/blog";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS for the blog — feed readers and a few aggregators still use it. */
export function GET() {
  const items = [...POSTS]
    .sort((a, b) => b.published.localeCompare(a.published))
    .map((p) => {
      const url = `${env.appUrl}/blog/${p.slug}`;
      return `<item><title>${esc(p.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${new Date(`${p.published}T09:00:00Z`).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>InstaDM247 guides</title><link>${env.appUrl}/blog</link><description>Guides to Instagram DM automation inside Instagram's rules.</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
