"use client";

import Link from "next/link";
import { ExternalLink, Eye, Link2, MousePointerClick, Palette, Plus } from "lucide-react";
import { BioPageView } from "@/components/bio/page-view";
import { Badge, Button, EmptyState } from "@/components/ui";
import { CopyField, StatCard } from "@/components/dashboard/bits";
import { SOCIAL_PLATFORMS, type BioDesign, type SocialPlatform } from "@/lib/bio-design";
import { Thumbnail } from "./shared";

export type BioListPage = {
  id: string;
  slug: string;
  title: string;
  bio: string | null;
  avatarUrl: string | null;
  handle: string | null;
  design: BioDesign;
  presetLabel: string;
  published: boolean;
  showBadge: boolean;
  viewCount: number;
  blocks: Array<{ id: string; kind: string; label: string; url: string | null; subtitle: string | null; imageUrl: string | null; enabled: boolean; clickCount: number }>;
};

/** Every page, with what it looks like and how it's doing. Editing happens on the page's own screen. */
export function BioList({ pages, appUrl }: { pages: BioListPage[]; appUrl: string }) {
  if (pages.length === 0) {
    return (
      <EmptyState
        icon={<Link2 />}
        title="No link-in-bio page yet"
        description="Pick a template, add your links, and paste the address into your Instagram bio. Every tap gets counted."
        action={
          <Link href="/dashboard/bio/new">
            <Button variant="gradient">
              <Plus className="h-4 w-4" /> New page
            </Button>
          </Link>
        }
      />
    );
  }

  const taps = (p: BioListPage) => p.blocks.reduce((s, b) => s + b.clickCount, 0);
  const totalViews = pages.reduce((sum, p) => sum + p.viewCount, 0);
  const totalTaps = pages.reduce((sum, p) => sum + taps(p), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pages" value={pages.length} icon={<Link2 />} tone="brand" />
        <StatCard label="Page views" value={totalViews} icon={<Eye />} />
        <StatCard label="Link taps" value={totalTaps} icon={<MousePointerClick />} tone="success" />
      </div>

      <div className="space-y-3">
        {pages.map((page) => (
          <article
            key={page.id}
            className="flex flex-col gap-5 rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)] sm:flex-row"
          >
            <Link href={`/dashboard/bio/${page.id}`} aria-label={`Edit ${page.title}`} className="self-center sm:self-start">
              <Thumbnail width={120}>
                <BioPageView
                  preview
                  still
                  page={{ ...page, shareUrl: "", badgeHref: "#", showBadge: page.showBadge }}
                  blocks={page.blocks.filter((b) => b.enabled)}
                />
              </Thumbnail>
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[16px] font-extrabold">{page.title}</p>
                    <Badge tone={page.published ? "success" : "neutral"}>{page.published ? "Live" : "Draft"}</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] font-bold text-[var(--text-muted)]">
                    {page.presetLabel} · {page.blocks.length} block{page.blocks.length === 1 ? "" : "s"} · {page.viewCount.toLocaleString()} views ·{" "}
                    {taps(page).toLocaleString()} taps
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/l/${page.slug}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="sm">
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </Button>
                  </a>
                  <Link href={`/dashboard/bio/${page.id}?tab=design`}>
                    <Button variant="secondary" size="sm">
                      <Palette className="h-3.5 w-3.5" /> Design
                    </Button>
                  </Link>
                  <Link href={`/dashboard/bio/${page.id}`}>
                    <Button variant="primary" size="sm">
                      Edit
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="mt-3 max-w-sm">
                <CopyField label="Your link" value={`${appUrl}/l/${page.slug}`} />
              </div>

              {page.blocks.some((b) => b.kind !== "HEADING" && b.kind !== "TEXT") && (
                <ul className="mt-4 space-y-1.5 border-t-2 border-[var(--border-soft)] pt-3">
                  <li className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Most tapped</li>
                  {page.blocks
                    .filter((b) => b.kind !== "HEADING" && b.kind !== "TEXT")
                    .sort((a, b) => b.clickCount - a.clickCount)
                    .slice(0, 5)
                    .map((block) => (
                      <li key={block.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                        <span className="truncate font-semibold">{block.kind === "SOCIAL" ? `${SOCIAL_PLATFORMS[block.label as SocialPlatform]?.label ?? block.label} icon` : block.label}</span>
                        <span className="shrink-0 font-extrabold tabular-nums">{block.clickCount.toLocaleString()}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
