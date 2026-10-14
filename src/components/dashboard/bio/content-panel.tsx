"use client";

import * as React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Heading, Link2, Mail, MessageCircle, Plus, ShoppingBag, Trash2, Type, ArrowUp } from "lucide-react";
import { Badge, Button, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/bio-design";
import { cn } from "@/lib/utils";
import { blockKey, tabSlugFrom, type BioDraft, type EditorBlock, type EditorTab } from "./shared";

const MAX_TABS = 50;

const BLOCK_KINDS = [
  { id: "LINK", label: "Link", icon: Link2, hint: "A button to any web page" },
  { id: "PRODUCT", label: "Product", icon: ShoppingBag, hint: "A product with a price or note" },
  { id: "HEADING", label: "Heading", icon: Heading, hint: "Splits the page into sections" },
  { id: "TEXT", label: "Text", icon: Type, hint: "A line or two of words" },
  { id: "EMAIL", label: "Email", icon: Mail, hint: "Opens an email to you" },
  { id: "WHATSAPP", label: "WhatsApp", icon: MessageCircle, hint: "Opens a WhatsApp chat" },
] as const;

type Update = (changes: Partial<BioDraft> | ((d: BioDraft) => Partial<BioDraft>)) => void;

export function ContentPanel({
  draft,
  update,
  activeTab,
  setActiveTab,
  appUrl,
}: {
  draft: BioDraft;
  update: Update;
  /** The tab being edited: a tab key, or null for home. */
  activeTab: string | null;
  setActiveTab: (key: string | null) => void;
  appUrl: string;
}) {
  const socials = draft.blocks.filter((b) => b.kind === "SOCIAL");
  const blocks = draft.blocks.filter((b) => b.kind !== "SOCIAL" && b.tab === activeTab);
  const tab = draft.tabs.find((t) => t.key === activeTab) ?? null;

  const patch = (key: string, changes: Partial<EditorBlock>) =>
    update((d) => ({ blocks: d.blocks.map((b) => (b.key === key ? { ...b, ...changes } : b)) }));
  const remove = (key: string) => update((d) => ({ blocks: d.blocks.filter((b) => b.key !== key) }));
  const add = (block: Omit<EditorBlock, "key">) => update((d) => ({ blocks: [...d.blocks, { ...block, key: blockKey() }] }));
  /** Swap with the next one up or down in its own list (social icons, or this tab's blocks). */
  const move = (key: string, direction: -1 | 1) =>
    update((d) => {
      const i = d.blocks.findIndex((b) => b.key === key);
      const me = d.blocks[i];
      const same = (b: EditorBlock) => (b.kind === "SOCIAL") === (me.kind === "SOCIAL") && b.tab === me.tab;
      let j = i + direction;
      while (j >= 0 && j < d.blocks.length && !same(d.blocks[j])) j += direction;
      if (j < 0 || j >= d.blocks.length) return {};
      const next = [...d.blocks];
      [next[i], next[j]] = [next[j], next[i]];
      return { blocks: next };
    });

  return (
    <div className="space-y-4">
      <TabsCard draft={draft} update={update} activeTab={activeTab} setActiveTab={setActiveTab} appUrl={appUrl} />

      {tab ? (
        <p className="rounded-xl border-2 border-dashed border-[var(--border-soft)] px-4 py-3 text-[12.5px] text-[var(--text-muted)]">
          Your name, picture, bio and social icons show on every tab. Edit them on <button type="button" className="font-bold text-[var(--accent)] underline" onClick={() => setActiveTab(null)}>{draft.homeLabel || "Home"}</button>.
        </p>
      ) : (
      <>
      <SectionCard title="Profile">
        <div className="space-y-4">
          <Field label="Name">
            <Input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="Demo Studio" maxLength={80} />
          </Field>
          <Field label="Bio" hint="A line or two under your name.">
            <Textarea
              value={draft.bio}
              onChange={(e) => update({ bio: e.target.value })}
              placeholder="Hand-thrown ceramics from a small studio in London."
              maxLength={300}
            />
          </Field>
          <Field label="Profile picture link" hint="Optional. Leave empty to use your Instagram photo.">
            <Input value={draft.avatarUrl} onChange={(e) => update({ avatarUrl: e.target.value })} placeholder="https://…" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Social icons" description="A row of icons under your name. Taps are counted like any other link.">
        <div className="space-y-2">
          {socials.map((block, i) => {
            const platform = SOCIAL_PLATFORMS[block.label as SocialPlatform];
            return (
              <div key={block.key} className={cn("flex flex-wrap items-center gap-2", !block.enabled && "opacity-50")}>
                <Select value={block.label} onChange={(e) => patch(block.key, { label: e.target.value })} className="w-auto min-w-[130px]">
                  {Object.entries(SOCIAL_PLATFORMS).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                <Input
                  value={block.url ?? ""}
                  onChange={(e) => patch(block.key, { url: e.target.value })}
                  placeholder={platform?.placeholder ?? "https://…"}
                  className="min-w-[180px] flex-1"
                />
                <RowActions
                  block={block}
                  first={i === 0}
                  last={i === socials.length - 1}
                  onMove={(dir) => move(block.key, dir)}
                  onToggle={(v) => patch(block.key, { enabled: v })}
                  onRemove={() => remove(block.key)}
                />
              </div>
            );
          })}
          {socials.length < 12 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const used = new Set(socials.map((s) => s.label));
                const next = (Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[]).find((p) => !used.has(p)) ?? "website";
                add({ kind: "SOCIAL", label: next, url: "", subtitle: null, imageUrl: null, enabled: true, tab: null });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add an icon
            </Button>
          )}
        </div>
      </SectionCard>

      </>
      )}

      <SectionCard
        title={tab ? `Blocks on ${tab.label || "this tab"}` : draft.tabs.length ? `Blocks on ${draft.homeLabel || "Home"}` : "Blocks"}
        description="The buttons and words on this page, top to bottom."
      >
        <div className="space-y-2.5">
          {blocks.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">No blocks yet. Add one below.</p>}
          {blocks.map((block, i) => (
            <BlockEditor
              key={block.key}
              block={block}
              first={i === 0}
              last={i === blocks.length - 1}
              onPatch={(c) => patch(block.key, c)}
              onMove={(dir) => move(block.key, dir)}
              onRemove={() => remove(block.key)}
            />
          ))}

          {blocks.length < 50 && (
            <div className="pt-2">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Add a block</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BLOCK_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() =>
                      add({ kind: k.id, label: "", url: k.id === "HEADING" || k.id === "TEXT" ? null : "", subtitle: null, imageUrl: null, enabled: true, tab: activeTab })
                    }
                    className="flex items-start gap-2.5 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-2.5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--shadow-ink)]"
                  >
                    <k.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <span>
                      <span className="block text-[13px] font-extrabold">{k.label}</span>
                      <span className="block text-[11.5px] leading-snug text-[var(--text-muted)]">{k.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/** The tabs bar: pick one to edit, add one, and the open tab's name, link and visibility. */
function TabsCard({
  draft,
  update,
  activeTab,
  setActiveTab,
  appUrl,
}: {
  draft: BioDraft;
  update: Update;
  activeTab: string | null;
  setActiveTab: (key: string | null) => void;
  appUrl: string;
}) {
  const tab = draft.tabs.find((t) => t.key === activeTab) ?? null;
  const index = tab ? draft.tabs.indexOf(tab) : -1;
  /** A link no other tab on this page uses. */
  const freeSlug = (base: string, except?: string) => {
    const taken = new Set(draft.tabs.filter((t) => t.key !== except).map((t) => t.slug));
    const root = base || "page";
    let slug = root;
    for (let n = 2; taken.has(slug); n++) slug = `${root}-${n}`;
    return slug;
  };
  const patchTab = (key: string, changes: Partial<EditorTab>) =>
    update((d) => ({ tabs: d.tabs.map((t) => (t.key === key ? { ...t, ...changes } : t)) }));

  function addTab() {
    const label = `Page ${draft.tabs.length + 2}`;
    const key = blockKey();
    update((d) => ({ tabs: [...d.tabs, { key, label, slug: freeSlug(tabSlugFrom(label)), enabled: true }] }));
    setActiveTab(key);
  }
  function removeTab(t: EditorTab) {
    const count = draft.blocks.filter((b) => b.tab === t.key).length;
    if (count && !confirm(`Delete the "${t.label}" tab and its ${count} block${count === 1 ? "" : "s"}?`)) return;
    update((d) => ({ tabs: d.tabs.filter((x) => x.key !== t.key), blocks: d.blocks.filter((b) => b.tab !== t.key) }));
    setActiveTab(null);
  }
  function moveTab(direction: -1 | 1) {
    const j = index + direction;
    if (!tab || j < 0 || j >= draft.tabs.length) return;
    update((d) => {
      const next = [...d.tabs];
      [next[index], next[j]] = [next[j], next[index]];
      return { tabs: next };
    });
  }

  const chip = (active: boolean, dim = false) =>
    cn(
      "shrink-0 rounded-xl border-2 px-3 py-1.5 text-[13px] font-bold transition-colors",
      active ? "border-[var(--border)] bg-[var(--color-pow-400)] text-[#12110e] shadow-[2px_2px_0_0_var(--shadow-ink)]" : "border-[var(--border-soft)] hover:border-[var(--border)]",
      dim && "opacity-50",
    );

  return (
    <SectionCard
      title="Tabs"
      description="Pages inside your page, like Shop or Links. Each has its own blocks and its own link; your one link-in-bio address leads to all of them."
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setActiveTab(null)} className={chip(activeTab === null)} aria-pressed={activeTab === null}>
          {draft.homeLabel || "Home"}
        </button>
        {draft.tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} className={chip(t.key === activeTab, !t.enabled)} aria-pressed={t.key === activeTab}>
            {t.label || "Untitled"}
          </button>
        ))}
        {draft.tabs.length < MAX_TABS && (
          <Button variant="secondary" size="sm" onClick={addTab}>
            <Plus className="h-3.5 w-3.5" /> Add a tab
          </Button>
        )}
      </div>

      {activeTab === null && draft.tabs.length > 0 && (
        <Field label="Name of this tab" className="mt-4 max-w-xs" hint={`The first tab, at ${appUrl}/l/${draft.slug}`}>
          <Input value={draft.homeLabel} onChange={(e) => update({ homeLabel: e.target.value })} placeholder="Home" maxLength={30} />
        </Field>
      )}

      {tab && (
        <div className="mt-4 space-y-3 rounded-xl border-2 border-[var(--border-soft)] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tab name">
              <Input
                value={tab.label}
                maxLength={30}
                onChange={(e) => {
                  const label = e.target.value;
                  // The link follows the name until it's been set by hand.
                  const auto = tab.slug === freeSlug(tabSlugFrom(tab.label), tab.key);
                  patchTab(tab.key, auto ? { label, slug: freeSlug(tabSlugFrom(label), tab.key) } : { label });
                }}
                placeholder="Shop"
              />
            </Field>
            <Field label="Link" hint={`${appUrl}/l/${draft.slug}/${tab.slug || "…"}`}>
              <Input
                value={tab.slug}
                maxLength={40}
                onChange={(e) => patchTab(tab.key, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                onBlur={() => patchTab(tab.key, { slug: freeSlug(tabSlugFrom(tab.slug), tab.key) })}
                placeholder="shop"
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Switch checked={tab.enabled} onCheckedChange={(v) => patchTab(tab.key, { enabled: v })} label="Show this tab" />
            <span className="text-[13px] font-bold">{tab.enabled ? "Shown" : "Hidden from visitors"}</span>
            <span className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => moveTab(-1)} disabled={index === 0} aria-label="Move tab left">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => moveTab(1)} disabled={index === draft.tabs.length - 1} aria-label="Move tab right">
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="text-[var(--color-zap-500)]" onClick={() => removeTab(tab)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete tab
              </Button>
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function BlockEditor({
  block,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: {
  block: EditorBlock;
  first: boolean;
  last: boolean;
  onPatch: (changes: Partial<EditorBlock>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const kind = BLOCK_KINDS.find((k) => k.id === block.kind) ?? BLOCK_KINDS[0];
  const words = block.kind === "HEADING" || block.kind === "TEXT";
  return (
    <div className={cn("space-y-2 rounded-xl border-2 border-[var(--border)] p-3", !block.enabled && "opacity-50")}>
      <div className="flex items-center gap-2">
        <Select value={block.kind} onChange={(e) => onPatch({ kind: e.target.value })} className="w-auto min-w-[120px]" aria-label="Block type">
          {BLOCK_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
        {typeof block.clickCount === "number" && block.clickCount > 0 && <Badge tone="info">{block.clickCount} taps</Badge>}
        <RowActions block={block} first={first} last={last} onMove={onMove} onToggle={(v) => onPatch({ enabled: v })} onRemove={onRemove} />
      </div>

      {block.kind === "TEXT" ? (
        <Textarea value={block.label} onChange={(e) => onPatch({ label: e.target.value })} placeholder="Some words…" maxLength={120} />
      ) : (
        <Input
          value={block.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={block.kind === "HEADING" ? "Section title" : block.kind === "PRODUCT" ? "Product name" : "Button text"}
          maxLength={120}
          aria-label={`${kind.label} text`}
        />
      )}

      {!words && (
        <>
          <Input
            value={block.url ?? ""}
            onChange={(e) => onPatch({ url: e.target.value })}
            placeholder={block.kind === "EMAIL" ? "hello@example.com" : block.kind === "WHATSAPP" ? "+1234567890" : "https://…"}
            aria-label={block.kind === "EMAIL" ? "Email address" : block.kind === "WHATSAPP" ? "Phone number" : "Link"}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={block.subtitle ?? ""}
              onChange={(e) => onPatch({ subtitle: e.target.value })}
              placeholder={block.kind === "PRODUCT" ? "Price or note, e.g. $29" : "Subtitle (optional)"}
              maxLength={160}
            />
            <Input value={block.imageUrl ?? ""} onChange={(e) => onPatch({ imageUrl: e.target.value })} placeholder="Image link (optional)" />
          </div>
        </>
      )}
    </div>
  );
}

function RowActions({
  block,
  first,
  last,
  onMove,
  onToggle,
  onRemove,
}: {
  block: EditorBlock;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const icon = "grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30";
  return (
    <div className="ml-auto flex items-center gap-1">
      <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Move up" className={icon}>
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Move down" className={icon}>
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <Switch checked={block.enabled} onCheckedChange={onToggle} label="Show on the page" />
      <button type="button" onClick={onRemove} aria-label="Remove" className={cn(icon, "hover:text-[var(--color-zap-500)]")}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
