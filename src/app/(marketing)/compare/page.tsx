import type { Metadata } from "next";
import Link from "next/link";
import { COMPARISONS } from "@/content/compare";
import { CtaBand, PageHero } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: "Compare",
  description:
    "How InstaDM247 compares with LinkDM, SendDM, Reachlee and ManyChat for Instagram DM automation, feature by feature, including where they're ahead.",
  alternates: { canonical: "/compare" },
};

export default function CompareIndex() {
  return (
    <>
      <PageHero
        eyebrow="Compare"
        title="Honest comparisons, including where they win."
        intro="Each page lists what the other tool publishes about itself, what we do, and where they're ahead. If something's out of date, tell us at support@instadm247.com and we'll fix it."
      />
      <section className="mx-auto grid max-w-5xl gap-4 px-5 py-16 sm:grid-cols-2">
        {COMPARISONS.map((c) => (
          <Link
            key={c.slug}
            href={`/compare/${c.slug}`}
            className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5"
          >
            <h2 className="text-[20px] font-extrabold">InstaDM247 vs {c.name}</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">{c.summary}</p>
          </Link>
        ))}
      </section>
      <CtaBand />
    </>
  );
}
