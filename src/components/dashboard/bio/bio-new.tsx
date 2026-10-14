"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { BIO_STARTERS, presetDesign } from "@/lib/bio-design";
import { cn } from "@/lib/utils";
import { BioPageView } from "@/components/bio/page-view";
import { cleanSlug, Thumbnail, useSlugAvailability, type BioAccount } from "./shared";

/**
 * Start a page: pick a template, name it, claim its link. Then straight to
 * the editor, so the details of one page never sit in a form for another.
 */
export function BioNew({
  accounts,
  suggestions,
  appUrl,
  branded,
}: {
  accounts: BioAccount[];
  /** A free link for each account's page, worked out by the server. */
  suggestions: Record<string, string>;
  appUrl: string;
  branded: boolean;
}) {
  const router = useRouter();
  const [starterId, setStarterId] = React.useState(BIO_STARTERS[0].id);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const [title, setTitle] = React.useState(account?.username ?? "");
  const [slug, setSlug] = React.useState(account ? (suggestions[account.id] ?? "") : "");
  // Until the person types their own, the name and link follow the account picked.
  const [edited, setEdited] = React.useState({ title: false, slug: false });
  const [saving, setSaving] = React.useState(false);
  const slugState = useSlugAvailability(slug, null);
  const starter = BIO_STARTERS.find((s) => s.id === starterId)!;

  async function create() {
    if (!title.trim() || !slug.trim()) return toast.error("A name and a link are both needed.");
    if (slugState.status === "unavailable") return toast.error(slugState.message);
    setSaving(true);
    try {
      const res = await fetch("/api/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          title: title.trim(),
          theme: starter.preset,
          accountId: accountId || null,
          published: false,
          blocks: starter.blocks,
        }),
      });
      const data = (await res.json()) as { error?: string; page?: { id: string } };
      if (!res.ok || !data.page) throw new Error(data.error ?? "Could not create the page");
      router.push(`/dashboard/bio/${data.page.id}`);
    } catch (error) {
      toast.error((error as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard title="1. Pick a template" description="You can change everything about it afterwards.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {BIO_STARTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStarterId(s.id)}
              aria-pressed={s.id === starterId}
              className={cn(
                "flex flex-col items-center rounded-2xl border-2 p-3 text-center transition-transform hover:-translate-y-0.5",
                s.id === starterId ? "border-[var(--border)] bg-[var(--bg-sunken)] shadow-[3px_3px_0_0_var(--shadow-ink)]" : "border-transparent",
              )}
            >
              <Thumbnail width={110}>
                <BioPageView
                  preview
                  still
                  page={{
                    id: s.id,
                    title: title || "Your name",
                    bio: null,
                    avatarUrl: account?.profilePictureUrl ?? null,
                    design: presetDesign(s.preset),
                    showBadge: branded,
                    badgeHref: "#",
                    handle: account?.username ?? null,
                    shareUrl: "",
                  }}
                  blocks={s.blocks}
                />
              </Thumbnail>
              <span className="mt-2 text-[14px] font-extrabold">{s.label}</span>
              <span className="text-[12px] leading-snug text-[var(--text-muted)]">{s.description}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="2. Name it and claim your link">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name on the page">
            <Input value={title} onChange={(e) => {
                setTitle(e.target.value);
                setEdited((x) => ({ ...x, title: true }));
              }}
              placeholder="Demo Studio" maxLength={80} />
          </Field>
          <Field
            label="Link"
            hint={
              slugState.status === "available"
                ? `✓ Available: ${appUrl}/l/${slug}`
                : slugState.status === "checking"
                  ? "Checking…"
                  : `${appUrl}/l/${slug || "your-name"}`
            }
            error={slugState.status === "unavailable" ? slugState.message : undefined}
          >
            <Input value={slug} onChange={(e) => {
                setSlug(cleanSlug(e.target.value));
                setEdited((x) => ({ ...x, slug: true }));
              }}
              placeholder="demo-studio" />
          </Field>
          {accounts.length > 0 && (
            <Field label="Instagram account" hint="Shows your @handle, and your Instagram photo unless you add another.">
              <Select
                value={accountId}
                onChange={(e) => {
                  const next = accounts.find((a) => a.id === e.target.value);
                  setAccountId(e.target.value);
                  if (next && !edited.title) setTitle(next.username);
                  if (next && !edited.slug) setSlug(suggestions[next.id] ?? "");
                }}
              >
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="gradient"
            onClick={create}
            loading={saving}
            disabled={slugState.status === "unavailable" || slugState.status === "checking"}
          >
            Create and edit <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-[12.5px] text-[var(--text-muted)]">It starts as a draft. Nobody sees it until you publish.</p>
        </div>
      </SectionCard>
    </div>
  );
}
