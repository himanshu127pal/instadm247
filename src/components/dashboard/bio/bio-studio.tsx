"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Eye, LayoutList, Palette, Redo2, Settings2, Undo2, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CopyField } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";
import { ContentPanel } from "./content-panel";
import { DesignPanel } from "./design-panel";
import { SettingsPanel } from "./settings-panel";
import { DraftPreview, PhoneFrame, useHistory, type BioAccount, type BioDraft } from "./shared";

const TABS = [
  { id: "content", label: "Blocks", icon: LayoutList },
  { id: "design", label: "Design", icon: Palette },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function BioStudio({
  pageId,
  initial,
  accounts,
  appUrl,
  branded,
  initialTab,
}: {
  pageId: string;
  initial: BioDraft;
  accounts: BioAccount[];
  appUrl: string;
  branded: boolean;
  initialTab: Tab;
}) {
  const history = useHistory(initial);
  const draft = history.state;
  const [saved, setSaved] = React.useState(initial);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [saving, setSaving] = React.useState<"save" | "publish" | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const account = accounts.find((a) => a.id === draft.accountId) ?? null;

  const update = React.useCallback(
    (changes: Partial<BioDraft> | ((d: BioDraft) => Partial<BioDraft>)) =>
      history.set((d) => ({ ...d, ...(typeof changes === "function" ? changes(d) : changes) })),
    [history],
  );

  // Leaving with unsaved changes asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Ctrl/Cmd+Z and Shift+Z, except while typing (fields keep their own undo).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  async function save(changes: Partial<BioDraft> = {}) {
    const next = { ...draft, ...changes };
    if (!next.title.trim()) {
      setTab("content");
      return toast.error("Give the page a name.");
    }
    if (!next.slug.trim()) {
      setTab("settings");
      return toast.error("The page needs a link.");
    }
    setSaving(changes.published ? "publish" : "save");
    try {
      // Social icons first: they always show under the header.
      const blocks = [...next.blocks.filter((b) => b.kind === "SOCIAL"), ...next.blocks.filter((b) => b.kind !== "SOCIAL")].filter((b) =>
        b.label.trim(),
      );
      const res = await fetch("/api/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pageId,
          slug: next.slug.trim(),
          title: next.title.trim(),
          bio: next.bio.trim() || null,
          avatarUrl: next.avatarUrl.trim() || null,
          theme: next.theme,
          design: next.design,
          published: next.published,
          showBadge: next.showBadge,
          accountId: next.accountId || null,
          blocks: blocks.map(({ id, kind, label, url, subtitle, imageUrl, enabled }) => ({
            id,
            kind,
            label: label.trim(),
            url: url?.trim() || null,
            subtitle: subtitle?.trim() || null,
            imageUrl: imageUrl?.trim() || null,
            enabled,
          })),
        }),
      });
      const data = (await res.json()) as { error?: string; blockIds?: string[] };
      if (!res.ok) throw new Error(data.error ?? "Could not save the page");
      // New blocks now have ids: give them to every undo step too, so a later
      // save updates them (and keeps their taps) instead of recreating them.
      const ids = new Map(blocks.map((b, i) => [b.key, data.blockIds?.[i]]));
      const withIds = (d: BioDraft): BioDraft => ({ ...d, blocks: d.blocks.map((b) => (b.id || !ids.get(b.key) ? b : { ...b, id: ids.get(b.key) })) });
      history.mapAll(withIds);
      if (changes.published !== undefined) update({ published: changes.published });
      setSaved(withIds(next));
      toast.success(changes.published === true ? "Published. Your link is live." : "Saved");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const liveUrl = `${appUrl}/l/${saved.slug}`;
  const preview = (
    <PhoneFrame>
      <DraftPreview draft={draft} account={account} branded={branded} appUrl={appUrl} />
    </PhoneFrame>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/bio"
          onClick={(e) => {
            if (dirty && !confirm("Leave without saving? Your changes will be lost.")) e.preventDefault();
          }}
          className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> All pages
        </Link>
        <h1 className="font-display text-[26px] leading-none tracking-wide">{draft.title || "Untitled page"}</h1>
        <Badge tone={saved.published ? "success" : "neutral"}>{saved.published ? "Live" : "Draft"}</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo">
            <Undo2 className="h-4 w-4" /> Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo">
            <Redo2 className="h-4 w-4" /> Redo
          </Button>
          {dirty && <span className="text-[12px] font-bold text-[var(--text-muted)]">Unsaved changes</span>}
          <Button variant={saved.published ? "primary" : "secondary"} onClick={() => save()} loading={saving === "save"} disabled={!dirty || saving !== null}>
            Save
          </Button>
          {!saved.published && (
            <Button variant="gradient" onClick={() => save({ published: true })} loading={saving === "publish"} disabled={saving !== null}>
              Publish
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div role="tablist" className="flex gap-1.5 rounded-2xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-extrabold transition-colors",
                  tab === t.id ? "bg-[var(--color-pow-400)] text-[#12110e] shadow-[2px_2px_0_0_var(--shadow-ink)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]",
                )}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>

          {tab === "content" && <ContentPanel draft={draft} update={update} />}
          {tab === "design" && <DesignPanel draft={draft} update={update} />}
          {tab === "settings" && (
            <SettingsPanel draft={draft} update={update} pageId={pageId} appUrl={appUrl} accounts={accounts} branded={branded} />
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-3">
            {preview}
            <div className="mx-auto w-[320px] space-y-2">
              <CopyField label="Your link" value={liveUrl} />
              {saved.published && (
                <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 text-[12.5px] font-bold text-[var(--accent)] hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Open the live page
                </a>
              )}
              <p className="text-center text-[11.5px] text-[var(--text-faint)]">Preview of your changes. Visitors see them once you save.</p>
            </div>
          </div>
        </aside>
      </div>

      {/* Small screens: the preview opens over the editor. */}
      <button
        type="button"
        onClick={() => setShowPreview(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)] px-4 py-2.5 text-[14px] font-extrabold text-[#12110e] shadow-[3px_3px_0_0_var(--shadow-ink)] lg:hidden"
      >
        <Eye className="h-4 w-4" /> Preview
      </button>
      {showPreview && (
        <div role="dialog" aria-modal="true" aria-label="Preview" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 lg:hidden">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            aria-label="Close preview"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--border)] bg-[var(--bg-raised)]"
          >
            <X className="h-5 w-5" />
          </button>
          <PhoneFrame className="h-[min(640px,85vh)]">
            <DraftPreview draft={draft} account={account} branded={branded} appUrl={appUrl} />
          </PhoneFrame>
        </div>
      )}
    </div>
  );
}
