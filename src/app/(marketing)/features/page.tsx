import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FEATURES } from "@/content/features";
import { CtaBand, PageHero } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Every InstaDM247 feature: comment-to-DM, story replies and reactions, DM auto-replies, follow-to-unlock, lead capture, AI replies, link in bio, broadcasts and account safety.",
  alternates: { canonical: "/features" },
};

export default function FeaturesIndex() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything you need to answer every DM."
        intro="Built only on Meta's official Instagram API, with Instagram's rules checked on every message. Pick a feature to see how it works."
      />
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <Link
              key={feature.slug}
              href={`/features/${feature.slug}`}
              className="group rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5"
            >
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent)]">
                {feature.eyebrow}
              </p>
              <h2 className="mt-2 text-[19px] font-extrabold leading-snug">{feature.headline}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">{feature.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--accent)]">
                How it works <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
