import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { DOC_GROUPS, allDocs, plain } from "@/content/docs";
import { CtaBand, PageHero } from "@/components/marketing/content";
import { DocsSearch } from "@/components/marketing/docs-search";

export const metadata: Metadata = {
  title: "Docs",
  description: "How to set up InstaDM247: connect Instagram, build comment-to-DM and story automations, broadcasts, lead capture, analytics and account safety.",
  alternates: { canonical: "/docs" },
};

export default function DocsIndex() {
  const docs = allDocs({ billingEnabled: env.billing.enabled });
  return (
    <>
      <PageHero
        eyebrow="Docs"
        title="Everything InstaDM247 does, and where to find it."
        intro="Step-by-step setup and product guidance, kept in step with the app."
      >
        <DocsSearch docs={docs.map(({ slug, title, summary, group, body }) => ({ slug, title, summary, group, text: plain(body) }))} />
      </PageHero>
      <section className="mx-auto max-w-5xl space-y-12 px-5 py-14">
        {DOC_GROUPS.map((group) => {
          const items = docs.filter((d) => d.group === group.title);
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">{group.title}</h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {items.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/docs/${doc.slug}`}
                      className="block h-full rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5"
                    >
                      <h3 className="text-[18px] font-extrabold leading-snug">{doc.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{doc.summary}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-[14px] text-[var(--text-muted)]">
          Can&rsquo;t find it? Signed-in customers can ask the AI Helper or{" "}
          <Link href="/dashboard/support" className="font-semibold text-[var(--accent)] underline underline-offset-2">open a support ticket</Link>.
        </p>
      </section>
      <CtaBand />
    </>
  );
}
