import Link from "next/link";
import { Plus } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isBranded } from "@/lib/branding";
import { BIO_PRESETS, isCustomised, resolveDesign } from "@/lib/bio-design";
import { Button } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/bits";
import { BioList } from "@/components/dashboard/bio/bio-list";

export default async function BioPagesPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const pages = await prisma.bioPage.findMany({
    where: { workspaceId: workspace.id },
    include: {
      blocks: { orderBy: { order: "asc" } },
      account: { select: { username: true, profilePictureUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const branded = isBranded(workspace);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Link in bio"
        description="A hosted page for your Instagram bio link, with click tracking on every block, so you can see what people actually tap."
        actions={
          pages.length > 0 ? (
            <Link href="/dashboard/bio/new">
              <Button variant="gradient">
                <Plus className="h-4 w-4" /> New page
              </Button>
            </Link>
          ) : undefined
        }
      />
      <BioList
        appUrl={env.appUrl}
        pages={pages.map((page) => {
          const design = resolveDesign(page.theme, page.design);
          const preset = BIO_PRESETS.find((p) => p.id === page.theme);
          return {
            id: page.id,
            slug: page.slug,
            title: page.title,
            bio: page.bio,
            avatarUrl: page.avatarUrl ?? page.account?.profilePictureUrl ?? null,
            handle: page.account?.username ?? null,
            design,
            presetLabel: `${preset?.label ?? "Comic"}${isCustomised(page.theme, design) ? " (customised)" : ""}`,
            published: page.published,
            showBadge: page.showBadge || branded,
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
          };
        })}
      />
    </div>
  );
}
