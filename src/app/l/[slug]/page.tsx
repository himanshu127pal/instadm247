import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BioPageView } from "@/components/bio/page-view";

export const dynamic = "force-dynamic";

/**
 * The public Link-in-Bio page (SendDM #23).
 *
 * Deliberately outside every route group: no dashboard chrome, no auth, and
 * it must render fast on a phone from an Instagram profile tap.
 */

async function loadPage(slug: string) {
  return prisma.bioPage.findUnique({
    where: { slug },
    include: {
      blocks: { where: { enabled: true }, orderBy: { order: "asc" } },
      account: { select: { username: true, profilePictureUrl: true } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) return { title: "Not found" };

  return {
    title: page.title,
    description: page.bio ?? `Links from ${page.title}`,
    openGraph: {
      title: page.title,
      description: page.bio ?? undefined,
      type: "profile",
    },
  };
}

export default async function PublicBioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await loadPage(slug);

  if (!page || !page.published) notFound();

  // Fire-and-forget view count; a slow analytics write must never delay the page.
  void prisma.bioPage
    .update({ where: { id: page.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);
  void prisma.bioPageView.create({ data: { pageId: page.id } }).catch(() => undefined);

  return (
    <BioPageView
      page={{
        id: page.id,
        title: page.title,
        bio: page.bio,
        avatarUrl: page.avatarUrl ?? page.account?.profilePictureUrl ?? null,
        theme: page.theme,
        showBadge: page.showBadge,
        handle: page.account?.username ?? null,
      }}
      blocks={page.blocks.map((block) => ({
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
