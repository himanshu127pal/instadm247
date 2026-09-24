import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { POSTS, getPost } from "@/content/blog";
import { Blocks, CtaBand, JsonLd, formatDate } from "@/components/marketing/content";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.published,
      modifiedTime: post.updated ?? post.published,
    },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const others = POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description,
          datePublished: post.published,
          dateModified: post.updated ?? post.published,
          author: { "@type": "Organization", name: "InstaDM247" },
          publisher: { "@type": "Organization", name: "InstaDM247", logo: { "@type": "ImageObject", url: `${env.appUrl}/icon.png` } },
          mainEntityOfPage: `${env.appUrl}/blog/${post.slug}`,
        }}
      />
      <article className="mx-auto max-w-2xl px-5 pb-16 pt-14 sm:pt-20">
        <Link href="/blog" className="text-[13px] font-bold text-[var(--accent)] hover:underline">
          ← All guides
        </Link>
        <h1 className="font-display mt-5 text-[clamp(2rem,5vw,3.1rem)] leading-[0.98]">{post.title}</h1>
        <p className="mt-4 text-[13px] font-semibold text-[var(--text-faint)]">
          {formatDate(post.published)}
          {post.updated && post.updated !== post.published && <> · updated {formatDate(post.updated)}</>} ·{" "}
          {post.readingMinutes} min read
        </p>
        <div className="mt-10">
          <Blocks blocks={post.body} />
        </div>
      </article>

      {others.length > 0 && (
        <section className="mx-auto max-w-2xl px-5 pb-16">
          <h2 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">Keep reading</h2>
          <ul className="mt-4 space-y-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/blog/${o.slug}`} className="text-[16px] font-bold text-[var(--accent)] hover:underline">
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CtaBand />
    </>
  );
}
