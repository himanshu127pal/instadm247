import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { COMPARISONS, getComparison } from "@/content/compare";
import { CompareCell, CtaBand, PageHero } from "@/components/marketing/content";

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = getComparison((await params).slug);
  if (!c) return { title: "Not found" };
  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: `/compare/${c.slug}` },
    openGraph: { title: c.title, description: c.description, type: "article" },
  };
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const c = getComparison((await params).slug);
  if (!c) notFound();

  return (
    <>
      <PageHero eyebrow="Compare" title={`InstaDM247 vs ${c.name}`} intro={c.summary} />

      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]">
            <h2 className="text-[16px] font-extrabold">Where {c.name} is ahead</h2>
            <ul className="mt-3 ml-5 list-disc space-y-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
              {c.theyLead.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)]/15 p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]">
            <h2 className="text-[16px] font-extrabold">Where InstaDM247 is ahead</h2>
            <ul className="mt-3 ml-5 list-disc space-y-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
              {c.weLead.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-[var(--radius-card)] border-[3px] border-[var(--border)] bg-[var(--bg-raised)] shadow-[6px_6px_0_0_var(--shadow-ink)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b-[2.5px] border-[var(--border)] bg-[var(--bg-sunken)]">
                  <th className="px-5 py-4 text-[12px] font-medium uppercase tracking-wider text-[var(--text-faint)]">Feature</th>
                  <th className="px-3 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--border)] bg-[var(--color-zap-400)] px-3 py-1 text-[12px] font-extrabold uppercase text-white">
                      <Sparkles className="h-3 w-3" /> InstaDM247
                    </span>
                  </th>
                  <th className="px-3 py-4 text-center text-[12.5px] font-bold text-[var(--text-muted)]">{c.name}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => (
                  <tr key={row.feature} className="border-b-2 border-[var(--border-soft)] last:border-0">
                    <td className="px-5 py-3 text-[14px] font-semibold">{row.feature}</td>
                    <td className="px-3 py-3 text-center"><CompareCell value={row.us} /></td>
                    <td className="px-3 py-3 text-center"><CompareCell value={row.them} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t-[2.5px] border-[var(--border)] bg-[var(--bg-sunken)] px-5 py-3 text-[12px] font-medium leading-relaxed text-[var(--text-muted)]">
            {c.name}&rsquo;s side is compiled from {c.source}, {c.asOf}. &ldquo;Not listed&rdquo; means
            it isn&rsquo;t on their published feature list, not that they can&rsquo;t do it. Products
            change: check{" "}
            <a href={c.site} rel="noopener nofollow" className="underline">
              their site
            </a>{" "}
            for the current picture, and tell us at support@instadm247.com if we&rsquo;ve got something
            wrong.
            {c.theirPricing && <> Their pricing: {c.theirPricing}</>}
          </p>
        </div>

        <p className="mt-8 text-[14px] text-[var(--text-muted)]">
          Other comparisons:{" "}
          {COMPARISONS.filter((o) => o.slug !== c.slug).map((o, i) => (
            <span key={o.slug}>
              {i > 0 && " · "}
              <Link href={`/compare/${o.slug}`} className="font-semibold text-[var(--accent)] underline underline-offset-2">
                vs {o.name}
              </Link>
            </span>
          ))}
        </p>
      </section>
      <CtaBand />
    </>
  );
}
