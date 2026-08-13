"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  Link2,
  MousePointerClick,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { CopyField, SectionCard, StatCard } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

type Block = {
  id?: string;
  kind: string;
  label: string;
  url: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  enabled: boolean;
  clickCount?: number;
};

type Page = {
  id: string;
  slug: string;
  title: string;
  bio: string | null;
  avatarUrl: string | null;
  theme: string;
  published: boolean;
  showBadge: boolean;
  accountId: string | null;
  viewCount: number;
  blocks: Block[];
};

const THEMES = [
  { id: "comic", label: "Comic (cream)" },
  { id: "midnight", label: "Midnight" },
  { id: "punch", label: "Punch (red)" },
  { id: "mint", label: "Mint" },
  { id: "sky", label: "Sky" },
];

const BLOCK_KINDS = [
  { id: "LINK", label: "Link" },
  { id: "HEADING", label: "Heading" },
  { id: "TEXT", label: "Text" },
  { id: "EMAIL", label: "Email" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "PRODUCT", label: "Product" },
];

export function BioEditor({
  appUrl,
  accounts,
  pages,
}: {
  appUrl: string;
  accounts: Array<{ id: string; username: string }>;
  pages: Page[];
}) {
  const [editing, setEditing] = React.useState<Page | "new" | null>(
    pages.length === 0 ? null : null,
  );

  const totalClicks = pages.reduce(
    (sum, p) => sum + p.blocks.reduce((s, b) => s + (b.clickCount ?? 0), 0),
    0,
  );
  const totalViews = pages.reduce((sum, p) => sum + p.viewCount, 0);

  return (
    <div className="space-y-5">
      {pages.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Pages" value={pages.length} icon={<Link2 />} tone="brand" />
          <StatCard label="Page views" value={totalViews} icon={<Eye />} />
          <StatCard
            label="Link taps"
            value={totalClicks}
            icon={<MousePointerClick />}
            tone="success"
          />
        </div>
      )}

      <Button variant="gradient" onClick={() => setEditing("new")}>
        <Plus className="h-4 w-4" />
        New page
      </Button>

      {editing && (
        <PageComposer
          appUrl={appUrl}
          accounts={accounts}
          page={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {pages.length === 0 && !editing ? (
        <EmptyState
          icon={<Link2 />}
          title="No link-in-bio page yet"
          description="Build one page, drop the link in your Instagram bio, and every tap gets counted."
        />
      ) : (
        <div className="space-y-3">
          {pages.map((page) => {
            const clicks = page.blocks.reduce((s, b) => s + (b.clickCount ?? 0), 0);
            return (
              <article
                key={page.id}
                className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-extrabold">{page.title}</p>
                      <Badge tone={page.published ? "success" : "neutral"}>
                        {page.published ? "Live" : "Draft"}
                      </Badge>
                      <Badge tone="info">{page.theme}</Badge>
                    </div>
                    <p className="mt-1 text-[12.5px] font-bold text-[var(--text-muted)]">
                      {page.blocks.length} block{page.blocks.length === 1 ? "" : "s"} ·{" "}
                      {page.viewCount.toLocaleString()} views · {clicks.toLocaleString()} taps
                    </p>
                    <div className="mt-3 max-w-sm">
                      <CopyField label="Your link" value={`${appUrl}/l/${page.slug}`} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a href={`/l/${page.slug}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Button>
                    </a>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(page)}>
                      Edit
                    </Button>
                  </div>
                </div>

                {page.blocks.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t-2 border-[var(--border-soft)] pt-3">
                    {page.blocks
                      .filter((b) => b.kind !== "HEADING" && b.kind !== "TEXT")
                      .sort((a, b) => (b.clickCount ?? 0) - (a.clickCount ?? 0))
                      .slice(0, 5)
                      .map((block) => (
                        <li
                          key={block.id}
                          className="flex items-baseline justify-between gap-3 text-[12.5px]"
                        >
                          <span className="truncate font-semibold">{block.label}</span>
                          <span className="shrink-0 font-extrabold tabular-nums">
                            {(block.clickCount ?? 0).toLocaleString()}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PageComposer({
  appUrl,
  accounts,
  page,
  onDone,
}: {
  appUrl: string;
  accounts: Array<{ id: string; username: string }>;
  page: Page | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [slug, setSlug] = React.useState(page?.slug ?? "");
  const [title, setTitle] = React.useState(page?.title ?? "");
  const [bio, setBio] = React.useState(page?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(page?.avatarUrl ?? "");
  const [theme, setTheme] = React.useState(page?.theme ?? "comic");
  const [published, setPublished] = React.useState(page?.published ?? true);
  const [showBadge, setShowBadge] = React.useState(page?.showBadge ?? true);
  const [accountId, setAccountId] = React.useState(page?.accountId ?? accounts[0]?.id ?? "");
  const [blocks, setBlocks] = React.useState<Block[]>(
    page?.blocks ?? [
      { kind: "LINK", label: "My shop", url: "https://example.com", subtitle: null, imageUrl: null, enabled: true },
    ],
  );
  const [saving, setSaving] = React.useState(false);

  function patchBlock(i: number, changes: Partial<Block>) {
    setBlocks((current) => current.map((b, j) => (j === i ? { ...b, ...changes } : b)));
  }

  function move(i: number, direction: -1 | 1) {
    const target = i + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[target]] = [next[target], next[i]];
    setBlocks(next);
  }

  async function save() {
    if (!slug.trim() || !title.trim()) {
      toast.error("A link and a title are both needed.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: page?.id,
          slug: slug.trim().toLowerCase(),
          title: title.trim(),
          bio: bio.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          theme,
          published,
          showBadge,
          accountId: accountId || null,
          blocks: blocks.filter((b) => b.label.trim()),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the page");

      toast.success("Page saved");
      onDone();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!page) return onDone();
    if (!confirm(`Delete "${page.title}"? The link stops working immediately.`)) return;

    const res = await fetch("/api/bio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: page.id }),
    });
    if (res.ok) {
      toast.success("Page deleted");
      onDone();
      router.refresh();
    }
  }

  return (
    <SectionCard title={page ? "Edit page" : "New page"}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Demo Studio"
            />
          </Field>
          <Field label="Link" hint={`${appUrl}/l/${slug || "your-name"}`}>
            <Input
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
              }
              placeholder="demo-studio"
            />
          </Field>
        </div>

        <Field label="Bio" hint="A line or two under your name.">
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Hand-thrown ceramics from a small studio in London."
            maxLength={300}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Theme">
            <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Avatar URL" hint="Optional — falls back to your Instagram photo.">
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>

        {accounts.length > 0 && (
          <Field label="Instagram account" hint="Used for the @handle and avatar fallback.">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* Blocks */}
        <div>
          <p className="mb-2 text-[13px] font-extrabold">Blocks</p>
          <div className="space-y-2">
            {blocks.map((block, i) => (
              <div
                key={i}
                className={cn(
                  "space-y-2 rounded-xl border-2 border-[var(--border)] p-3",
                  !block.enabled && "opacity-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <Select
                    value={block.kind}
                    onChange={(e) => patchBlock(i, { kind: e.target.value })}
                    className="w-auto min-w-[120px]"
                  >
                    {BLOCK_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </Select>

                  {typeof block.clickCount === "number" && block.clickCount > 0 && (
                    <Badge tone="info">{block.clickCount} taps</Badge>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === blocks.length - 1}
                      aria-label="Move down"
                      className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <Switch
                      checked={block.enabled}
                      onCheckedChange={(v) => patchBlock(i, { enabled: v })}
                      label="Show this block"
                    />
                    <button
                      onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}
                      aria-label="Remove block"
                      className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] hover:text-[var(--color-zap-500)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <Input
                  value={block.label}
                  onChange={(e) => patchBlock(i, { label: e.target.value })}
                  placeholder={block.kind === "TEXT" ? "Some words…" : "Button text"}
                />

                {!["HEADING", "TEXT"].includes(block.kind) && (
                  <>
                    <Input
                      value={block.url ?? ""}
                      onChange={(e) => patchBlock(i, { url: e.target.value })}
                      placeholder={
                        block.kind === "EMAIL"
                          ? "hello@example.com"
                          : block.kind === "WHATSAPP"
                            ? "+1234567890"
                            : "https://…"
                      }
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={block.subtitle ?? ""}
                        onChange={(e) => patchBlock(i, { subtitle: e.target.value })}
                        placeholder="Subtitle (optional)"
                      />
                      <Input
                        value={block.imageUrl ?? ""}
                        onChange={(e) => patchBlock(i, { imageUrl: e.target.value })}
                        placeholder="Thumbnail URL (optional)"
                      />
                    </div>
                  </>
                )}
              </div>
            ))}

            {blocks.length < 50 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setBlocks([
                    ...blocks,
                    { kind: "LINK", label: "", url: "", subtitle: null, imageUrl: null, enabled: true },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add a block
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border-2 border-[var(--border)] p-3">
            <Switch checked={published} onCheckedChange={setPublished} label="Published" />
            <span className="text-[13px] font-bold">
              {published ? "Live" : "Draft — the link 404s"}
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border-2 border-[var(--border)] p-3">
            <Switch checked={showBadge} onCheckedChange={setShowBadge} label="Show badge" />
            <span className="text-[13px] font-bold">Show &ldquo;Made with InstaDM247&rdquo;</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={save} loading={saving}>
            Save page
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          {page && (
            <Button variant="ghost" className="ml-auto text-[var(--color-zap-500)]" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
