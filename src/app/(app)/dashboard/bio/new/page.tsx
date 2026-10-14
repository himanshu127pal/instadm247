import Link from "next/link";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isBranded } from "@/lib/branding";
import { suggestSlug } from "@/lib/bio-slug";
import { Button, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/bits";
import { Aperture, ArrowLeft } from "lucide-react";
import { BioNew } from "@/components/dashboard/bio/bio-new";

export default async function NewBioPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, username: true, profilePictureUrl: true, bioPage: { select: { id: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });
  // One page per Instagram account (docs/BIO.md): only accounts without one.
  const free = accounts.filter((a) => !a.bioPage).map(({ id, username, profilePictureUrl }) => ({ id, username, profilePictureUrl }));
  const taken = accounts.filter((a) => a.bioPage);

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <Link href="/dashboard/bio" className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" /> All pages
      </Link>
      <PageHeader title="New link-in-bio page" />
      {free.length > 0 ? (
        <BioNew
          accounts={free}
          // A free link per account, so the form never opens on one that's taken.
          suggestions={Object.fromEntries(await Promise.all(free.map(async (a) => [a.id, await suggestSlug(a.username)] as const)))}
          appUrl={env.appUrl}
          branded={isBranded(workspace)}
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Aperture />}
          title="Connect Instagram first"
          description="Each link-in-bio page belongs to one of your Instagram accounts."
          action={
            <Link href="/dashboard/accounts">
              <Button variant="gradient">Connect Instagram</Button>
            </Link>
          }
        />
      ) : (
        <EmptyState
          icon={<Aperture />}
          title="Every account already has its page"
          description="Each Instagram account gets one link. To add more, open your page and add a tab: a Shop, Links or Services page that lives at its own address under your link."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {taken.map((a) => (
                <Link key={a.id} href={`/dashboard/bio/${a.bioPage!.id}`}>
                  <Button variant="secondary">Add a tab to @{a.username}</Button>
                </Link>
              ))}
            </div>
          }
        />
      )}
    </div>
  );
}
