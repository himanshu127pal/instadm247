import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { Accordion } from "@/components/marketing/bits";
import { FEATURES, getFeature } from "@/content/features";
import { CtaBand, JsonLd, PageHero } from "@/components/marketing/content";

export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const feature = getFeature((await params).slug);
  if (!feature) return { title: "Not found" };
  return {
    title: feature.title,
    description: feature.description,
    alternates: { canonical: `/features/${feature.slug}` },
    openGraph: { title: feature.title, description: feature.description, type: "website" },
  };
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const feature = getFeature((await params).slug);
  if (!feature) notFound();
  const related = feature.related.map(getFeature).filter((f) => f !== undefined);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: feature.faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }}
      />
      <PageHero eyebrow={feature.eyebrow} title={feature.headline} intro={feature.intro}>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup">
            <Button variant="gradient" size="lg" className="group">
              Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </PageHero>

      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-[0.98]">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {feature.steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)] text-[14px] font-extrabold text-[#12110e]">
                {i + 1}
              </span>
              <h3 className="mt-3 text-[16px] font-extrabold">{step.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y-[3px] border-[var(--border)] bg-[var(--bg-subtle)] py-16">
        <div className="mx-auto grid max-w-5xl gap-4 px-5 sm:grid-cols-2">
          {feature.highlights.map((h) => (
            <div key={h.title} className="rounded-[var(--radius-card)] border-2 border-[var(--border)] bg-[var(--bg-raised)] p-5">
              <h3 className="text-[16px] font-extrabold">{h.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-5 py-16 lg:grid-cols-[minmax(0,280px)_1fr]">
        <h2 className="font-display text-[clamp(1.8rem,4vw,2.4rem)] leading-[0.98]">Questions</h2>
        <Accordion items={feature.faqs.map((f) => ({ question: f.question, answer: f.answer }))} />
      </section>

      {related.length > 0 && (
        <section className="mx-auto max-w-5xl px-5 pb-16">
          <h2 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">Works well with</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/features/${r.slug}`}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-4 text-[15px] font-extrabold transition-colors hover:bg-[var(--color-pow-400)]/25"
              >
                {r.name} →
              </Link>
            ))}
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}
