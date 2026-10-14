"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Heading, Link2, Mail, MessageCircle, Plus, ShoppingBag, Trash2, Type } from "lucide-react";
import { Badge, Button, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/bio-design";
import { cn } from "@/lib/utils";
import { blockKey, type BioDraft, type EditorBlock } from "./shared";

const BLOCK_KINDS = [
  { id: "LINK", label: "Link", icon: Link2, hint: "A button to any web page" },
  { id: "PRODUCT", label: "Product", icon: ShoppingBag, hint: "A product with a price or note" },
  { id: "HEADING", label: "Heading", icon: Heading, hint: "Splits the page into sections" },
  { id: "TEXT", label: "Text", icon: Type, hint: "A line or two of words" },
  { id: "EMAIL", label: "Email", icon: Mail, hint: "Opens an email to you" },
  { id: "WHATSAPP", label: "WhatsApp", icon: MessageCircle, hint: "Opens a WhatsApp chat" },
] as const;

type Update = (changes: Partial<BioDraft> | ((d: BioDraft) => Partial<BioDraft>)) => void;

export function ContentPanel({ draft, update }: { draft: BioDraft; update: Update }) {
  const socials = draft.blocks.filter((b) => b.kind === "SOCIAL");
  const blocks = draft.blocks.filter((b) => b.kind !== "SOCIAL");

  const patch = (key: string, changes: Partial<EditorBlock>) =>
    update((d) => ({ blocks: d.blocks.map((b) => (b.key === key ? { ...b, ...changes } : b)) }));
  const remove = (key: string) => update((d) => ({ blocks: d.blocks.filter((b) => b.key !== key) }));
  const add = (block: Omit<EditorBlock, "key">) => update((d) => ({ blocks: [...d.blocks, { ...block, key: blockKey() }] }));
  /** Move within its own list (socials among socials, blocks among blocks). */
  const move = (key: string, direction: -1 | 1) =>
    update((d) => {
      const isSocial = d.blocks.find((b) => b.key === key)?.kind === "SOCIAL";
      const group = d.blocks.filter((b) => (b.kind === "SOCIAL") === isSocial);
      const others = d.blocks.filter((b) => (b.kind === "SOCIAL") !== isSocial);
      const i = group.findIndex((b) => b.key === key);
      const j = i + direction;
      if (j < 0 || j >= group.length) return {};
      [group[i], group[j]] = [group[j], group[i]];
      return { blocks: isSocial ? [...group, ...others] : [...others, ...group] };
    });

  return (
    <div className="space-y-4">
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
                add({ kind: "SOCIAL", label: next, url: "", subtitle: null, imageUrl: null, enabled: true });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add an icon
            </Button>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Blocks" description="The buttons and words on your page, top to bottom.">
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
                      add({ kind: k.id, label: "", url: k.id === "HEADING" || k.id === "TEXT" ? null : "", subtitle: null, imageUrl: null, enabled: true })
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
