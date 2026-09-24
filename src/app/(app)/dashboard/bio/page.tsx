import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/bits";
import { BioEditor } from "@/components/dashboard/bio-editor";
import { isBranded } from "@/lib/branding";

export default async function BioPagesPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [pages, accounts] = await Promise.all([
    prisma.bioPage.findMany({
      where: { workspaceId: workspace.id },
      include: {
        blocks: { orderBy: { order: "asc" } },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, username: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Link in bio"
        description="A hosted page for your Instagram bio link — with click tracking on every block, so you can see what people actually tap."
      />
      <BioEditor
        branded={isBranded(workspace)}
        appUrl={env.appUrl}
        accounts={accounts}
        pages={pages.map((page) => ({
          id: page.id,
          slug: page.slug,
          title: page.title,
          bio: page.bio,
          avatarUrl: page.avatarUrl,
          theme: page.theme,
          published: page.published,
          showBadge: page.showBadge,
          accountId: page.accountId,
          viewCount: page.viewCount,
          blocks: page.blocks.map((b) => ({
            id: b.id,
            kind: b.kind,
            label: b.label,
            url: b.url,
            subtitle: b.subtitle,
            imageUrl: b.imageUrl,
            enabled: b.enabled,
            clickCount: b.clickCount,
          })),
        }))}
      />
    </div>
  );
}
