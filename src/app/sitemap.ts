import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { FEATURES } from "@/content/features";
import { COMPARISONS } from "@/content/compare";
import { POSTS } from "@/content/blog";
import { allDocs } from "@/content/docs";

/** Read at request time: which pages exist depends on runtime env (billing). */
export const dynamic = "force-dynamic";

/**
 * Public pages only. Customers' link-in-bio pages are left to be found from
 * their Instagram profiles rather than listed here: they're theirs, not ours.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${env.appUrl}${path}`;
  const staticPages = [
    { path: "/", priority: 1 },
    { path: "/features", priority: 0.9 },
    { path: "/compare", priority: 0.7 },
    { path: "/blog", priority: 0.7 },
    { path: "/docs", priority: 0.7 },
    // Pricing 404s until billing is switched on; don't advertise a dead page.
    ...(env.billing.enabled ? [{ path: "/pricing", priority: 0.8 }] : []),
    { path: "/signup", priority: 0.5 },
    { path: "/privacy", priority: 0.2 },
    { path: "/terms", priority: 0.2 },
    { path: "/refunds", priority: 0.2 },
    { path: "/data-deletion", priority: 0.1 },
  ];

  return [
    ...staticPages.map((p) => ({ url: url(p.path), priority: p.priority })),
    ...FEATURES.map((f) => ({ url: url(`/features/${f.slug}`), priority: 0.8 })),
    ...COMPARISONS.map((c) => ({ url: url(`/compare/${c.slug}`), priority: 0.6 })),
    ...allDocs({ billingEnabled: env.billing.enabled }).map((d) => ({ url: url(`/docs/${d.slug}`), priority: 0.6 })),
    ...POSTS.map((p) => ({
      url: url(`/blog/${p.slug}`),
      lastModified: new Date(`${p.updated ?? p.published}T00:00:00Z`),
      priority: 0.6,
    })),
  ];
}
