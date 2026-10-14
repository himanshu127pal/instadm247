import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isBranded } from "@/lib/branding";
import { suggestSlug } from "@/lib/bio-slug";
import { PageHeader } from "@/components/dashboard/bits";
import { BioNew } from "@/components/dashboard/bio/bio-new";

export default async function NewBioPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, username: true, profilePictureUrl: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <Link href="/dashboard/bio" className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" /> All pages
      </Link>
      <PageHeader title="New link-in-bio page" />
      <BioNew
        accounts={accounts}
        // A free link per account, so the form never opens on one that's taken.
        suggestions={Object.fromEntries(await Promise.all(accounts.map(async (a) => [a.id, await suggestSlug(a.username)] as const)))}
        appUrl={env.appUrl}
        branded={isBranded(workspace)}
      />
    </div>
  );
}
