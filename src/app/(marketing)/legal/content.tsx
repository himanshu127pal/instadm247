/**
 * Legal pages. Meta App Review requires a reachable privacy policy, terms and
 * data-deletion page before Advanced Access is granted, so these ship with the
 * product rather than being a later chore.
 *
 * These are a starting point written for this product's actual data flows — have
 * a lawyer review them before you go live, and fill in the bracketed details.
 */

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl px-5 py-20">
      {/* Big enough for Bangers. The h2s inside are prose-sized and are not —
          they take the default heading face. */}
      <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)]">{title}</h1>
      <p className="mt-2 text-[13px] text-[var(--text-faint)]">Last updated {updated}</p>
      <div className="mt-10 space-y-7 text-[15px] leading-relaxed text-[var(--text-muted)] [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-[var(--text)] [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-[var(--text)] [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
