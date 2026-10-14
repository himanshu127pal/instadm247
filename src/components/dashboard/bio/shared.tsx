"use client";

import * as React from "react";
import { BioPageView, type BioBlock } from "@/components/bio/page-view";
import { presetDesign, type BioDesign } from "@/lib/bio-design";
import { cn } from "@/lib/utils";

/**
 * `key` is the editor's own handle on a block, before and after it has an id.
 * `tab` is the key of the tab it's on; null is the home tab.
 */
export type EditorBlock = BioBlock & { key: string; tab: string | null; enabled: boolean; clickCount?: number };

/** A page inside the page, at /l/<page>/<slug>. Existing tabs use their id as key. */
export type EditorTab = { key: string; id?: string; label: string; slug: string; enabled: boolean };

/** A tab's link from its name: "Shop all" → "shop-all". */
export function tabSlugFrom(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}

export function blockKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export type BioAccount = { id: string; username: string; profilePictureUrl: string | null };

/** Everything the editor can change, saved in one go. */
export type BioDraft = {
  slug: string;
  title: string;
  bio: string;
  avatarUrl: string;
  accountId: string;
  published: boolean;
  showBadge: boolean;
  theme: string;
  design: BioDesign;
  homeLabel: string;
  tabs: EditorTab[];
  blocks: EditorBlock[];
};

/** The phone the live preview sits in. Scrolls inside, like the real thing. */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto h-[640px] w-[320px] overflow-hidden rounded-[42px] border-[9px] border-[#12110e] bg-[#12110e] shadow-[6px_6px_0_0_var(--shadow-ink)]",
        className,
      )}
    >
      <div className="h-full w-full overflow-y-auto overflow-x-hidden rounded-[33px] bg-white [scrollbar-width:none]">{children}</div>
    </div>
  );
}

/** The page as a visitor sees it, drawn from a draft, on the open tab. */
export function DraftPreview({
  draft,
  account,
  branded,
  appUrl,
  activeTab = null,
  onSelectTab,
}: {
  draft: BioDraft;
  account: BioAccount | null;
  branded: boolean;
  appUrl: string;
  /** The open tab's key; null is home. */
  activeTab?: string | null;
  onSelectTab?: (key: string | null) => void;
}) {
  const visibleTabs = draft.tabs.filter((t) => t.enabled || t.key === activeTab);
  const tab = visibleTabs.find((t) => t.key === activeTab) ?? null;
  const shown = draft.blocks.filter(
    (b) => b.enabled && b.label.trim() && (b.tab === (tab?.key ?? null) || (b.kind === "SOCIAL" && b.tab === null)),
  );
  const tabs = visibleTabs.length
    ? [
        { key: "home", label: draft.homeLabel || "Home", active: !tab, onSelect: onSelectTab && (() => onSelectTab(null)) },
        ...visibleTabs.map((t) => ({ key: t.key, label: t.label || "Untitled", active: t.key === tab?.key, onSelect: onSelectTab && (() => onSelectTab(t.key)) })),
      ]
    : [];
  return (
    <BioPageView
      preview
      tabs={tabs}
      page={{
        id: "preview",
        title: draft.title || "Your name",
        bio: draft.bio || null,
        avatarUrl: draft.avatarUrl.trim() || account?.profilePictureUrl || null,
        design: draft.design,
        showBadge: draft.showBadge || branded,
        badgeHref: "#",
        handle: account?.username ?? null,
        shareUrl: `${appUrl}/l/${draft.slug}`,
      }}
      blocks={shown}
    />
  );
}

/**
 * A page shrunk to a thumbnail: the real renderer at 390px wide, scaled down.
 * Not interactive.
 */
export function Thumbnail({ children, width = 150 }: { children: React.ReactNode; width?: number }) {
  const scale = width / 390;
  return (
    <div
      aria-hidden
      className="pointer-events-none relative shrink-0 overflow-hidden rounded-[18px] border-[3px] border-[#12110e] bg-white"
      style={{ width, height: width * 1.75 }}
      // The scaled page can't be tabbed into.
      inert
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: 390, height: 390 * 1.75, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/** A preset as a little swatch: page colour, two blocks, a title bar. */
export function PresetSwatch({ id, label, active, onClick }: { id: string; label: string; active: boolean; onClick: () => void }) {
  const d = presetDesign(id);
  const bg =
    d.bgType === "gradient"
      ? d.gradient === "radial"
        ? `radial-gradient(circle at 50% 0%, ${d.bgStart}, ${d.bgEnd} 75%)`
        : `linear-gradient(${d.gradient === "diagonal" ? "135deg" : "180deg"}, ${d.bgStart}, ${d.bgEnd})`
      : d.bgStart;
  const blockStyle: React.CSSProperties = {
    background: d.blockBg,
    borderRadius: Math.min(d.radius, 8) / 2,
    border: d.blockOutline ? `1.5px solid ${d.blockText}` : undefined,
    boxShadow: d.blockShadow && d.blockOutline ? `2px 2px 0 0 ${d.shadow}` : undefined,
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group rounded-2xl border-2 p-1.5 text-left transition-transform hover:-translate-y-0.5",
        active ? "border-[var(--border)] bg-[var(--bg-sunken)] shadow-[3px_3px_0_0_var(--shadow-ink)]" : "border-transparent",
      )}
    >
      <span className="flex h-28 flex-col items-center gap-1.5 overflow-hidden rounded-xl px-3 pt-3" style={{ background: bg }}>
        <span className="h-7 w-7 rounded-full" style={{ background: d.accent, border: d.avatarOutline ? `2px solid ${d.text}` : undefined }} />
        <span className="h-1.5 w-12 rounded-full" style={{ background: d.text }} />
        <span className="mt-1 h-4 w-full" style={blockStyle} />
        <span className="h-4 w-full" style={blockStyle} />
      </span>
      <span className="mt-1.5 block text-center text-[12.5px] font-bold">{label}</span>
    </button>
  );
}

export type SlugState =
  | { status: "idle" | "checking" | "available" }
  | { status: "unavailable"; message: string };

/**
 * Checks the link as it's typed, a moment after the last keystroke, so a taken
 * or reserved link is caught before Save rather than after. The server checks
 * again on save — this is for feedback, not enforcement. The page's own saved
 * link always counts as available to it.
 */
export function useSlugAvailability(slug: string, pageId: string | null): SlugState {
  const [state, setState] = React.useState<SlugState>({ status: "idle" });

  React.useEffect(() => {
    const value = slug.trim().toLowerCase();
    if (!value) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "checking" });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ slug: value, ...(pageId ? { pageId } : {}) });
        const res = await fetch(`/api/bio/slug?${params}`, { signal: controller.signal });
        const data = (await res.json()) as { available?: boolean; reason?: string };
        if (!res.ok) return setState({ status: "idle" });
        setState(
          data.available
            ? { status: "available" }
            : { status: "unavailable", message: data.reason ?? "That link isn't available." },
        );
      } catch {
        // Aborted by the next keystroke, or offline: say nothing; save checks anyway.
        if (!controller.signal.aborted) setState({ status: "idle" });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, pageId]);

  return state;
}

/** What a typed link becomes: lowercase letters, numbers and hyphens. */
export function cleanSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * Undo and redo over the whole draft. Changes in quick succession (typing a
 * word, dragging a slider) collapse into one step.
 */
export function useHistory<T>(initial: T) {
  const [stack, setStack] = React.useState<{ past: T[]; present: T; future: T[] }>({ past: [], present: initial, future: [] });
  const lastChange = React.useRef(0);

  const set = React.useCallback((update: (current: T) => T) => {
    setStack((s) => {
      const next = update(s.present);
      if (next === s.present) return s;
      const now = Date.now();
      const merge = now - lastChange.current < 600 && s.past.length > 0;
      lastChange.current = now;
      return { past: merge ? s.past : [...s.past, s.present].slice(-100), present: next, future: [] };
    });
  }, []);
  const undo = React.useCallback(() => {
    lastChange.current = 0;
    setStack((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = React.useCallback(() => {
    lastChange.current = 0;
    setStack((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  /** Apply a change to every step, past and future too (ids the server just assigned). */
  const mapAll = React.useCallback((fn: (state: T) => T) => {
    setStack((s) => ({ past: s.past.map(fn), present: fn(s.present), future: s.future.map(fn) }));
  }, []);

  return { state: stack.present, set, undo, redo, mapAll, canUndo: stack.past.length > 0, canRedo: stack.future.length > 0 };
}
