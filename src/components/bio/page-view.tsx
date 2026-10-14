"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Check, Globe, Mail, MessageCircle, Share2, ShoppingBag } from "lucide-react";
import { RemoteImg } from "@/components/ui/remote-img";
import { LogoMark } from "@/components/brand/logo";
import { BIO_FONTS, blockHref, withAlpha, type BioDesign } from "@/lib/bio-design";
import { cn, initials } from "@/lib/utils";
import { SOCIAL_PATHS } from "./social-icons";
import "./bio-fonts.css";

/**
 * The public Link-in-Bio page, and the live preview in the editor.
 *
 * Clicks are recorded with `sendBeacon` so navigation is never delayed or
 * blocked by the tracking call — the link opens whether or not analytics land.
 */

export type BioBlock = {
  id?: string;
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
  design: BioDesign;
  showBadge: boolean;
  badgeHref: string;
  handle: string | null;
  /** The page's public address, for the share button. */
  shareUrl: string;
};

const TITLE_SIZE = { sm: 26, md: 34, lg: 44 } as const;

/** A tab in the bar under the header. `href` on the live page; `onSelect` in the editor. */
export type BioTabLink = { key: string; label: string; href?: string; active: boolean; onSelect?: () => void };

/** An https URL, made safe to sit inside CSS `url("…")`. */
function cssUrl(url: string): string {
  return `url("${url.replace(/["'()\\\s]/g, (c) => encodeURIComponent(c))}")`;
}

function background(d: BioDesign): string {
  if (d.bgType === "image" && d.bgImageUrl) {
    // A wash of the page colour keeps text readable over any photo.
    return `linear-gradient(${withAlpha(d.bgStart, 0.45)}, ${withAlpha(d.bgStart, 0.45)}), ${cssUrl(d.bgImageUrl)} center / cover no-repeat`;
  }
  if (d.bgType === "gradient") {
    if (d.gradient === "radial") return `radial-gradient(circle at 50% 0%, ${d.bgStart}, ${d.bgEnd} 75%)`;
    return `linear-gradient(${d.gradient === "diagonal" ? "135deg" : "180deg"}, ${d.bgStart}, ${d.bgEnd})`;
  }
  return d.bgStart;
}

export function BioPageView({
  page,
  blocks,
  tabs = [],
  preview = false,
  still = false,
}: {
  page: BioPageData;
  /** The blocks to show: the home tab's, or the open tab's. Social icons always come from home. */
  blocks: BioBlock[];
  /** Shown as a bar when the page has more than one tab. */
  tabs?: BioTabLink[];
  /** In the editor: no click tracking, fills its frame instead of the screen. */
  preview?: boolean;
  /** A picture of the page (thumbnails): no links or buttons at all, so it can sit inside one. */
  still?: boolean;
}) {
  const d = page.design;

  function track(blockId: string | undefined) {
    if (preview || !blockId) return;
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

  const socials = blocks.filter((b) => b.kind === "SOCIAL");
  const rest = blocks.filter((b) => b.kind !== "SOCIAL");

  return (
    <main
      className={cn("relative overflow-hidden", preview ? "min-h-full" : "min-h-screen")}
      style={{ background: background(d), color: d.text, fontFamily: BIO_FONTS[d.bodyFont].css }}
    >
      {d.pattern === "halftone" && (
        // Halftone wash, so the page reads as printed rather than flat
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: `radial-gradient(${withAlpha(d.text, 0.13)} 1.6px, transparent 1.7px)`,
            backgroundSize: "10px 10px",
          }}
        />
      )}

      {d.showShare && !still && <ShareButton url={page.shareUrl} title={page.title} design={d} />}

      <div className={cn("relative mx-auto w-full max-w-md pb-14", d.header === "minimal" && "pt-14")}>
        <Header page={page} />

        {socials.length > 0 && (
          <div className="mb-7 flex flex-wrap justify-center gap-2.5 px-5">
            {socials.map((block, i) => {
              const href = blockHref("SOCIAL", block.url, block.label);
              if (!href) return null;
              if (still) {
                return (
                  <span key={block.id ?? i} className="grid h-9 w-9 place-items-center" style={{ color: d.text }}>
                    <SocialIcon platform={block.label} />
                  </span>
                );
              }
              return (
                <a
                  key={block.id ?? i}
                  href={href}
                  target={href.startsWith("mailto:") ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={() => track(block.id)}
                  aria-label={block.label}
                  className="grid h-9 w-9 place-items-center rounded-full transition-transform hover:-translate-y-0.5"
                  style={{ color: d.text }}
                >
                  <SocialIcon platform={block.label} />
                </a>
              );
            })}
          </div>
        )}

        {tabs.length > 1 && <TabBar tabs={tabs} design={d} still={still} />}

        <div className="space-y-3 px-5">
          {rest.map((block, i) => (
            <motion.div
              key={block.id ?? `new-${i}`}
              initial={preview ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 + i * 0.05 }}
            >
              <BlockRow block={block} design={d} still={still} onClick={() => track(block.id)} />
            </motion.div>
          ))}
        </div>

        {rest.length === 0 && socials.length === 0 && (
          <p className="px-5 text-center text-[14px] font-semibold opacity-60">Nothing here yet. Check back soon.</p>
        )}

        {page.showBadge && still && (
          <span className="mt-12 flex items-center justify-center gap-1.5 text-[11.5px] font-bold opacity-50">
            <LogoMark className="h-4 w-4" title="" />
            Made with InstaDM247
          </span>
        )}
        {page.showBadge && !still && (
          <a
            href={page.badgeHref}
            target="_blank"
            rel="noopener"
            className="mt-12 flex items-center justify-center gap-1.5 text-[11.5px] font-bold opacity-50 transition-opacity hover:opacity-90"
          >
            <LogoMark className="h-4 w-4" title="" />
            Made with InstaDM247
          </a>
        )}
      </div>
    </main>
  );
}

function TabBar({ tabs, design: d, still }: { tabs: BioTabLink[]; design: BioDesign; still: boolean }) {
  return (
    <nav aria-label="Pages" className="mb-6 px-5">
      <div className="flex gap-1 overflow-x-auto p-1 [scrollbar-width:none]" style={{ borderRadius: d.radius + 4 }}>
        {tabs.map((tab) => {
          const style: React.CSSProperties = tab.active
            ? {
                background: withAlpha(d.blockBg, 1 - d.transparency / 100),
                color: d.blockText,
                borderRadius: d.radius,
                border: d.blockOutline ? `2px solid ${d.blockText}` : "2px solid transparent",
                boxShadow: d.blockShadow && d.blockOutline ? `3px 3px 0 0 ${d.shadow}` : undefined,
              }
            : { color: d.text, borderRadius: d.radius, border: "2px solid transparent" };
          const className = "min-w-[6rem] flex-1 shrink-0 truncate px-4 py-2.5 text-center text-[13px] font-extrabold uppercase tracking-wide transition-opacity hover:opacity-80";
          if (still) return <span key={tab.key} className={className} style={style}>{tab.label}</span>;
          if (tab.onSelect) {
            return (
              <button key={tab.key} type="button" onClick={tab.onSelect} aria-current={tab.active ? "page" : undefined} className={className} style={style}>
                {tab.label}
              </button>
            );
          }
          return (
            <a key={tab.key} href={tab.href} aria-current={tab.active ? "page" : undefined} className={className} style={style}>
              {tab.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function Header({ page }: { page: BioPageData }) {
  const d = page.design;
  const titleStyle: React.CSSProperties = {
    fontFamily: BIO_FONTS[d.displayFont].css,
    fontSize: TITLE_SIZE[d.titleSize],
    letterSpacing: d.displayFont === "bangers" ? "0.03em" : undefined,
  };
  const text = (
    <>
      <h1 className="leading-tight" style={titleStyle}>
        {page.title}
      </h1>
      {page.handle && <p className="mt-1 text-[14px] font-bold opacity-70">@{page.handle}</p>}
      {page.bio && <p className="mx-auto mt-3 max-w-xs text-[14.5px] font-semibold leading-relaxed opacity-80">{page.bio}</p>}
    </>
  );

  if (d.header === "portrait") {
    // A big photo at the top that fades into the page, title over its foot.
    return (
      <header className="mb-7 text-center">
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <RemoteImg
            src={page.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            fallback={
              <span className="grid h-full w-full place-items-center text-[64px]" style={{ background: d.accent, color: d.accentText, fontFamily: BIO_FONTS[d.displayFont].css }}>
                {initials(page.title, "?")}
              </span>
            }
          />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: `linear-gradient(transparent, ${d.bgStart})` }} />
        </div>
        <div className="relative -mt-12 px-5">{text}</div>
      </header>
    );
  }

  const avatar = <Avatar page={page} />;
  if (d.header === "banner") {
    return (
      <header className="mb-7 text-center">
        <div className="h-36 w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${d.accent}, ${d.bgEnd})` }}>
          <RemoteImg src={d.coverUrl} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="relative px-5" style={{ marginTop: -d.avatarSize / 2 }}>
          {avatar}
          <div className="mt-4">{text}</div>
        </div>
      </header>
    );
  }

  return (
    <motion.header initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-7 px-5 text-center">
      {avatar}
      <div className="mt-5">{text}</div>
    </motion.header>
  );
}

function Avatar({ page }: { page: BioPageData }) {
  const d = page.design;
  const hard = d.blockShadow && d.blockOutline;
  const style: React.CSSProperties = {
    width: d.avatarSize,
    height: d.avatarSize,
    borderRadius: d.avatarShape === "circle" ? "9999px" : Math.max(12, d.avatarSize / 5),
    border: d.avatarOutline ? `3px solid ${d.text}` : undefined,
    boxShadow: d.avatarOutline && hard ? `5px 5px 0 0 ${d.shadow}` : undefined,
  };
  return (
    <RemoteImg
      src={page.avatarUrl}
      alt=""
      className="mx-auto object-cover"
      style={style}
      fallback={
        <span
          className="mx-auto grid place-items-center"
          style={{ ...style, background: d.accent, color: d.accentText, fontFamily: BIO_FONTS[d.displayFont].css, fontSize: d.avatarSize / 3 }}
        >
          {initials(page.title, "?")}
        </span>
      }
    />
  );
}

function BlockRow({ block, design: d, still, onClick }: { block: BioBlock; design: BioDesign; still: boolean; onClick: () => void }) {
  if (block.kind === "HEADING") {
    return (
      <h2 className="pt-4 text-center text-[20px] opacity-90" style={{ fontFamily: BIO_FONTS[d.displayFont].css }}>
        {block.label}
      </h2>
    );
  }
  if (block.kind === "TEXT") {
    return <p className="px-2 text-center text-[14px] font-semibold leading-relaxed opacity-80">{block.label}</p>;
  }

  const href = blockHref(block.kind, block.url);
  const Icon = block.kind === "EMAIL" ? Mail : block.kind === "WHATSAPP" ? MessageCircle : block.kind === "PRODUCT" ? ShoppingBag : ArrowUpRight;
  // Outline plus shadow is the comic look: a hard offset shadow that the
  // block "presses into" on tap. A shadow alone is soft.
  const hard = d.blockShadow && d.blockOutline;
  const style: React.CSSProperties = {
    background: withAlpha(d.blockBg, 1 - d.transparency / 100),
    color: d.blockText,
    borderRadius: d.radius,
    border: d.blockOutline ? `${hard ? 3 : 2}px solid ${d.blockText}` : "2px solid transparent",
    boxShadow: hard ? `4px 4px 0 0 ${d.shadow}` : d.blockShadow ? `0 8px 22px ${withAlpha(d.shadow, 0.35)}` : undefined,
  };
  const content = (
    <>
      <RemoteImg
        src={block.imageUrl}
        alt=""
        className="h-11 w-11 shrink-0 object-cover"
        style={{ borderRadius: Math.min(d.radius, 12), border: d.blockOutline ? `2px solid ${d.blockText}` : undefined }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-extrabold">{block.label}</span>
        {block.subtitle && <span className="block truncate text-[12.5px] font-semibold opacity-70">{block.subtitle}</span>}
      </span>
      <span
        className="grid h-8 w-8 shrink-0 place-items-center transition-transform group-hover:rotate-12"
        style={{
          background: d.accent,
          color: d.accentText,
          borderRadius: Math.min(d.radius, 10),
          border: d.blockOutline ? `2px solid ${d.blockText}` : undefined,
        }}
      >
        <Icon className="h-4 w-4" />
      </span>
    </>
  );
  const className = cn(
    "group flex items-center gap-3 px-4 py-3.5 transition-transform duration-150",
    hard
      ? "hover:-translate-x-[2px] hover:-translate-y-[2px] active:translate-x-[2px] active:translate-y-[2px]"
      : "hover:-translate-y-[2px]",
  );

  if (!href || still) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }
  return (
    <a href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" onClick={onClick} className={className} style={style}>
      {content}
    </a>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  if (platform === "email") return <Mail className="h-5 w-5" />;
  if (platform === "website") return <Globe className="h-5 w-5" />;
  if (platform === "linkedin") return <LinkedInMark />;
  const path = SOCIAL_PATHS[platform];
  if (!path) return <Globe className="h-5 w-5" />;
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  );
}

/** Not in Simple Icons (at LinkedIn's request): a rounded square with "in" cut out. */
function LinkedInMark() {
  const id = React.useId();
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <mask id={id}>
        <rect x="1" y="1" width="22" height="22" rx="4" fill="#fff" />
        <text x="12" y="17.5" textAnchor="middle" fontSize="14" fontWeight="900" fontFamily="Arial, sans-serif" fill="#000">
          in
        </text>
      </mask>
      <rect x="1" y="1" width="22" height="22" rx="4" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

function ShareButton({ url, title, design: d }: { url: string; title: string; design: BioDesign }) {
  const [copied, setCopied] = React.useState(false);
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Dismissed the share sheet: nothing to do.
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Link copied" : "Share this page"}
      className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full transition-transform hover:scale-105"
      style={{ background: withAlpha(d.blockBg, 0.9), color: d.blockText, border: `2px solid ${withAlpha(d.blockText, 0.25)}` }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
    </button>
  );
}
