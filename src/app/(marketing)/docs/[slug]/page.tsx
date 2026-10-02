import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { env } from "@/lib/env";
import { DOC_GROUPS, allDocs, parseDoc } from "@/content/docs";
import { CtaBand, renderInline } from "@/components/marketing/content";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const docs = () => allDocs({ billingEnabled: env.billing.enabled });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = docs().find((d) => d.slug === slug);
  if (!doc) return { title: "Not found" };
  return { title: `${doc.title} · Docs`, description: doc.summary, alternates: { canonical: `/docs/${doc.slug}` } };
}

/** Single asterisks are emphasis in the guide; shown as plain words here. */
const inline = (text: string) => renderInline(text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2"));

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const list = docs();
  const index = list.findIndex((d) => d.slug === slug);
  if (index < 0) notFound();
  const doc = list[index];
  const prev = list[index - 1];
  const next = list[index + 1];

  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-12 lg:grid-cols-[230px_1fr]">
        <nav aria-label="Docs" className="hidden lg:block">
          <div className="sticky top-24 space-y-5">
            {DOC_GROUPS.map((group) => {
              const items = list.filter((d) => d.group === group.title);
              if (!items.length) return null;
              return (
                <div key={group.title}>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">{group.title}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {items.map((d) => (
                      <li key={d.slug}>
                        <Link
                          href={`/docs/${d.slug}`}
                          className={cn(
                            "block rounded-lg px-2 py-1 text-[13.5px]",
                            d.slug === doc.slug ? "bg-[var(--color-pow-400)] font-bold text-[#12110e]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
                          )}
                        >
                          {d.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        <article className="min-w-0 max-w-2xl">
          <Link href="/docs" className="text-[13px] font-bold text-[var(--accent)] hover:underline">
            ← All docs
          </Link>
          <p className="mt-5 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">{doc.group}</p>
          <h1 className="font-display mt-2 text-[clamp(2rem,5vw,3rem)] leading-[0.98]">{doc.title}</h1>

          <div className="mt-8 space-y-4 text-[16px] leading-relaxed">
            {parseDoc(doc.body).map((block, i) =>
              block.kind === "p" ? (
                <p key={i}>{inline(block.text)}</p>
              ) : (
                (() => {
                  const List = block.kind === "ul" ? "ul" : "ol";
                  return (
                    <List key={i} className={cn("space-y-2 pl-6", block.kind === "ul" ? "list-disc" : "list-decimal")}>
                      {block.items.map((item, j) => (
                        <li key={j}>
                          {inline(item.text)}
                          {item.children.length > 0 && (
                            <ul className="mt-1.5 list-[circle] space-y-1 pl-5">
                              {item.children.map((c, k) => (
                                <li key={k}>{inline(c)}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </List>
                  );
                })()
              ),
            )}
          </div>

          {doc.path && (
            <Link href={doc.path} className="mt-8 inline-block">
              <Button variant="secondary">Open it in your dashboard <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          )}

          <div className="mt-12 flex flex-wrap justify-between gap-3 border-t-2 border-[var(--border-soft)] pt-6 text-[14px] font-bold">
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                <ArrowLeft className="h-4 w-4" /> {prev.title}
              </Link>
            ) : <span />}
            {next && (
              <Link href={`/docs/${next.slug}`} className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                {next.title} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </article>
      </div>
      <CtaBand />
    </>
  );
}
