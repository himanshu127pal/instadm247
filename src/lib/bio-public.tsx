import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BioPageView } from "@/components/bio/page-view";
import { badgeHref, isBranded } from "@/lib/branding";
import { resolveDesign } from "@/lib/bio-design";
import { resolveBioRedirect } from "@/lib/bio-pages";
import { env } from "@/lib/env";

/**
 * The public link-in-bio page, for /l/<slug> (the home tab) and
 * /l/<slug>/<tab>. Deliberately outside every route group: no dashboard
 * chrome, no auth, and it must render fast on a phone from a profile tap.
 */

async function load(slug: string) {
  return prisma.bioPage.findUnique({
    where: { slug },
    include: {
      blocks: { where: { enabled: true }, orderBy: { order: "asc" } },
      tabs: { where: { enabled: true }, orderBy: { order: "asc" } },
      account: { select: { username: true, profilePictureUrl: true } },
      workspace: { select: { planKey: true } },
    },
  });
}

export async function bioMetadata(slug: string, tabSlug: string | null): Promise<Metadata> {
  const page = await load(slug);
  if (!page) return { title: "Not found" };
  const tab = tabSlug ? page.tabs.find((t) => t.slug === tabSlug) : null;
  const name = tab ? `${page.title} · ${tab.label}` : page.title;
  // Free pages carry the brand into the tab and every link preview too.
  const title = isBranded(page.workspace) ? `${name} · InstaDM247` : name;
  return {
    title: { absolute: title },
    description: page.bio ?? `Links from ${page.title}`,
    openGraph: { title, description: page.bio ?? undefined, type: "profile" },
  };
}

export async function PublicBio({ slug, tabSlug }: { slug: string; tabSlug: string | null }) {
  const page = await load(slug);
  if (!page) {
    // An old address (renamed, or merged in as a tab) still works for a while.
    // Temporary, so a browser never remembers it once the address is freed.
    const to = await resolveBioRedirect(slug);
    // A merged page's address goes to its tab; a renamed page's keeps any tab path.
    if (to) redirect(`/l/${to.page}${to.tab ? `/${to.tab}` : tabSlug ? `/${tabSlug}` : ""}`);
    notFound();
  }
  if (!page.published) notFound();

  const tab = tabSlug ? page.tabs.find((t) => t.slug === tabSlug) : null;
  // A tab that's gone or hidden sends people to the page, not a dead end.
  if (tabSlug && !tab) redirect(`/l/${page.slug}`);

  // Fire-and-forget view count; a slow analytics write must never delay the page.
  void prisma.bioPage.update({ where: { id: page.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  void prisma.bioPageView.create({ data: { pageId: page.id } }).catch(() => undefined);

  const home = page.blocks.filter((b) => b.tabId === null);
  const shown = tab ? page.blocks.filter((b) => b.tabId === tab.id || (b.kind === "SOCIAL" && b.tabId === null)) : home;
  const tabs = page.tabs.length
    ? [
        { key: "home", label: page.homeLabel, href: `/l/${page.slug}`, active: !tab },
        ...page.tabs.map((t) => ({ key: t.id, label: t.label, href: `/l/${page.slug}/${t.slug}`, active: t.id === tab?.id })),
      ]
    : [];

  return (
    <BioPageView
      page={{
        id: page.id,
        title: page.title,
        bio: page.bio,
        avatarUrl: page.avatarUrl ?? page.account?.profilePictureUrl ?? null,
        design: resolveDesign(page.theme, page.design),
        shareUrl: `${env.appUrl}/l/${page.slug}${tab ? `/${tab.slug}` : ""}`,
        // On Free the badge shows whatever the saved setting says; the
        // setting only takes effect on a plan that removes branding.
        showBadge: page.showBadge || isBranded(page.workspace),
        badgeHref: badgeHref(page.slug),
        handle: page.account?.username ?? null,
      }}
      tabs={tabs}
      blocks={shown.map((block) => ({
        id: block.id,
        kind: block.kind,
        label: block.label,
        url: block.url,
        subtitle: block.subtitle,
        imageUrl: block.imageUrl,
      }))}
    />
  );
}
