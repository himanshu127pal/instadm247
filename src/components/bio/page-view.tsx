"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Mail, MessageCircle } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/**
 * The public Link-in-Bio page.
 *
 * Clicks are recorded with `sendBeacon` so navigation is never delayed or
 * blocked by the tracking call — the link opens whether or not analytics land.
 */

export type BioBlock = {
  id: string;
  kind: string;
  label: string;
  url: string | null;
  subtitle: string | null;
  imageUrl: string | null;
};

export type BioPageData = {
  id: string;
  title: string;
  bio: string | null;
  avatarUrl: string | null;
  theme: string;
  showBadge: boolean;
  handle: string | null;
};

const THEMES: Record<string, { bg: string; panel: string; accent: string; ink: string }> = {
  comic: { bg: "#fffdf7", panel: "#ffffff", accent: "#ffd23f", ink: "#12110e" },
  midnight: { bg: "#14131a", panel: "#232130", accent: "#c77dff", ink: "#f7f6f2" },
  punch: { bg: "#ff5d73", panel: "#fffdf7", accent: "#4cc9f0", ink: "#12110e" },
  mint: { bg: "#52d67a", panel: "#fffdf7", accent: "#ffd23f", ink: "#12110e" },
  sky: { bg: "#4cc9f0", panel: "#fffdf7", accent: "#ff9f45", ink: "#12110e" },
};

export function BioPageView({ page, blocks }: { page: BioPageData; blocks: BioBlock[] }) {
  const theme = THEMES[page.theme] ?? THEMES.comic;

  function track(blockId: string) {
    try {
      const payload = JSON.stringify({ blockId });
      // Beacon survives the page unloading as the link opens.
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/bio/click", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/bio/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      // Never let analytics break the link.
    }
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden px-5 py-14"
      style={{ background: theme.bg, color: theme.ink }}
    >
      {/* Halftone wash, so the page reads as printed rather than flat */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(${theme.ink}22 1.6px, transparent 1.7px)`,
          backgroundSize: "10px 10px",
        }}
      />

      <div className="relative mx-auto w-full max-w-md">
        <motion.header
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 text-center"
        >
          {page.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.avatarUrl}
              alt=""
              className="mx-auto h-24 w-24 rounded-full border-[3px] object-cover"
              style={{ borderColor: theme.ink, boxShadow: `5px 5px 0 0 ${theme.ink}` }}
            />
          ) : (
            <span
              className="font-display mx-auto grid h-24 w-24 place-items-center rounded-full border-[3px] text-[32px]"
              style={{
                borderColor: theme.ink,
                background: theme.accent,
                boxShadow: `5px 5px 0 0 ${theme.ink}`,
              }}
            >
              {initials(page.title, "?")}
            </span>
          )}

          <h1 className="font-display mt-5 text-[34px] leading-none tracking-wide">
            {page.title}
          </h1>
          {page.handle && (
            <p className="mt-1 text-[14px] font-bold opacity-70">@{page.handle}</p>
          )}
          {page.bio && (
            <p className="mx-auto mt-3 max-w-xs text-[14.5px] font-semibold leading-relaxed opacity-80">
              {page.bio}
            </p>
          )}
        </motion.header>

        <div className="space-y-3">
          {blocks.map((block, i) => (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 + i * 0.05 }}
            >
              <BlockRow block={block} theme={theme} onClick={() => track(block.id)} />
            </motion.div>
          ))}
        </div>

        {blocks.length === 0 && (
          <p className="text-center text-[14px] font-semibold opacity-60">
            Nothing here yet — check back soon.
          </p>
        )}

        {page.showBadge && (
          <p className="mt-12 text-center text-[11.5px] font-bold opacity-50">
            Made with InstaDM247
          </p>
        )}
      </div>
    </main>
  );
}

function BlockRow({
  block,
  theme,
  onClick,
}: {
  block: BioBlock;
  theme: { panel: string; accent: string; ink: string };
  onClick: () => void;
}) {
  if (block.kind === "HEADING") {
    return (
      <h2 className="font-display pt-4 text-center text-[22px] tracking-wide opacity-90">
        {block.label}
      </h2>
    );
  }

  if (block.kind === "TEXT") {
    return (
      <p className="px-2 text-center text-[14px] font-semibold leading-relaxed opacity-80">
        {block.label}
      </p>
    );
  }

  const href =
    block.kind === "EMAIL"
      ? `mailto:${block.url}`
      : block.kind === "WHATSAPP"
        ? `https://wa.me/${(block.url ?? "").replace(/[^\d]/g, "")}`
        : (block.url ?? "#");

  const Icon = block.kind === "EMAIL" ? Mail : block.kind === "WHATSAPP" ? MessageCircle : ArrowUpRight;

  return (
    <a
      href={href}
      target={block.kind === "EMAIL" ? undefined : "_blank"}
      rel="noopener noreferrer"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border-[3px] px-4 py-3.5",
        "transition-transform duration-150",
        "hover:-translate-x-[2px] hover:-translate-y-[2px] active:translate-x-[2px] active:translate-y-[2px]",
      )}
      style={{
        background: theme.panel,
        borderColor: theme.ink,
        color: theme.ink,
        boxShadow: `4px 4px 0 0 ${theme.ink}`,
      }}
    >
      {block.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.imageUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg border-2 object-cover"
          style={{ borderColor: theme.ink }}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-extrabold">{block.label}</span>
        {block.subtitle && (
          <span className="block truncate text-[12.5px] font-semibold opacity-70">
            {block.subtitle}
          </span>
        )}
      </span>
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 transition-transform group-hover:rotate-12"
        style={{ background: theme.accent, borderColor: theme.ink }}
      >
        <Icon className="h-4 w-4" />
      </span>
    </a>
  );
}
