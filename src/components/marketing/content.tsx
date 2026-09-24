import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, Minus, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { Block } from "@/content/blog";
import type { Cell } from "@/content/compare";

/**
 * Rendering for the content pages — features, comparisons, blog. Server
 * components only: none of this needs to ship JavaScript to a reader.
 */

/**
 * **bold** and [text](href). Links are internal paths or https URLs only;
 * anything else renders as plain text, so content can't smuggle in a
 * javascript: link.
 */
export function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      const href = match[3];
      if (href.startsWith("/")) {
        parts.push(
          <Link key={key++} href={href} className="font-semibold text-[var(--accent)] underline underline-offset-2">
            {match[2]}
          </Link>,
        );
      } else if (href.startsWith("https://")) {
        parts.push(
          <a key={key++} href={href} rel="noopener" className="font-semibold text-[var(--accent)] underline underline-offset-2">
            {match[2]}
          </a>,
        );
      } else {
        parts.push(match[2]);
      }
    }
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5 text-[16.5px] leading-[1.75] text-[var(--text-muted)] [&_strong]:text-[var(--text)]">
      {blocks.map((block, i) => {
        if ("h2" in block) {
          return (
            <h2 key={i} className="pt-4 text-[22px] font-extrabold leading-tight text-[var(--text)]">
              {block.h2}
            </h2>
          );
        }
        if ("p" in block) return <p key={i}>{renderInline(block.p)}</p>;
        if ("ul" in block) {
          return (
            <ul key={i} className="ml-5 list-disc space-y-2 marker:text-[var(--accent)]">
              {block.ul.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if ("ol" in block) {
          return (
            <ol key={i} className="ml-5 list-decimal space-y-2 marker:font-bold marker:text-[var(--accent)]">
              {block.ol.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <aside
            key={i}
            className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)]/20 p-4 shadow-[4px_4px_0_0_var(--shadow-ink)]"
          >
            <p className="text-[14px] font-extrabold text-[var(--text)]">{block.callout.title}</p>
            <p className="mt-1 text-[15px] leading-relaxed">{renderInline(block.callout.body)}</p>
          </aside>
        );
      })}
    </div>
  );
}

/** Structured data for search engines. `<` is escaped so content can't close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b-[3px] border-[var(--border)] bg-[var(--bg-subtle)]">
      <div aria-hidden className="halftone pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-4xl px-5 pb-14 pt-16 sm:pt-20">
        <span className="inline-flex -rotate-1 items-center gap-2 rounded-full border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)] px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#12110e] shadow-[3px_3px_0_0_var(--shadow-ink)]">
          {eyebrow}
        </span>
        <h1 className="font-display mt-6 text-[clamp(2.3rem,6vw,4rem)] leading-[0.95]">{title}</h1>
        {intro && (
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[var(--text-muted)]">{intro}</p>
        )}
        {children}
      </div>
    </section>
  );
}

export function CtaBand({ title = "Set it up once. Never miss a DM again." }: { title?: string }) {
  return (
    <section className="border-t-[3px] border-[var(--border)] bg-[var(--bg-subtle)] py-16">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-[clamp(1.9rem,4.5vw,2.8rem)] leading-[0.98]">{title}</h2>
        <p className="mx-auto mt-3 max-w-lg text-[15.5px] text-[var(--text-muted)]">
          Built only on Meta&rsquo;s official API. Every safety feature included on the free plan.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/signup">
            <Button variant="gradient" size="lg" className="group">
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
          <Link href="/features">
            <Button variant="ghost" size="lg">
              See every feature
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function CompareCell({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-[var(--color-boom-400)]/20 text-[var(--color-boom-500)]">
        <Check className="h-3.5 w-3.5" aria-label="Yes" strokeWidth={3} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--border-soft)] text-[var(--text-faint)]">
        <X className="h-3 w-3" aria-label="No" strokeWidth={3} />
      </span>
    );
  }
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--text-faint)]" title="Not on their published feature list">
        <Minus className="h-3 w-3" aria-hidden /> Not listed
      </span>
    );
  }
  return <span className="text-[12px] font-semibold text-[var(--text-muted)]">{value}</span>;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
