import { notFound } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isBranded } from "@/lib/branding";
import { resolveDesign } from "@/lib/bio-design";
import { BioStudio } from "@/components/dashboard/bio/bio-studio";

/** One page's editor: blocks, design and settings, with a live preview. */
export default async function EditBioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const { id } = await params;
  const { tab } = await searchParams;

  const [page, accounts] = await Promise.all([
    prisma.bioPage.findFirst({ where: { id, workspaceId: workspace.id }, include: { blocks: { orderBy: { order: "asc" } } } }),
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, username: true, profilePictureUrl: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <BioStudio
        pageId={page.id}
        appUrl={env.appUrl}
        branded={isBranded(workspace)}
        accounts={accounts}
        initialTab={tab === "design" || tab === "settings" ? tab : "content"}
        initial={{
          slug: page.slug,
          title: page.title,
          bio: page.bio ?? "",
          avatarUrl: page.avatarUrl ?? "",
          accountId: page.accountId ?? "",
          published: page.published,
          showBadge: page.showBadge,
          theme: page.theme,
          design: resolveDesign(page.theme, page.design),
          blocks: page.blocks.map((b) => ({
            key: b.id,
            id: b.id,
            kind: b.kind,
            label: b.label,
            url: b.url,
            subtitle: b.subtitle,
            imageUrl: b.imageUrl,
            enabled: b.enabled,
            clickCount: b.clickCount,
          })),
        }}
      />
    </div>
  );
}
