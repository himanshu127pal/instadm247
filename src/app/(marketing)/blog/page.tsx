import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "@/content/blog";
import { CtaBand, PageHero, formatDate } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides to Instagram DM automation that stays inside Instagram's rules: the 24-hour window, comment-to-DM, story reactions, lead capture and account safety.",
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => b.published.localeCompare(a.published));
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Guides to Instagram DMs that don't break the rules."
        intro="How Instagram's messaging rules actually work, and how to automate inside them."
      />
      <section className="mx-auto max-w-3xl px-5 py-14">
        <ul className="space-y-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5"
              >
                <p className="text-[12px] font-bold text-[var(--text-faint)]">
                  {formatDate(post.published)} · {post.readingMinutes} min read
                </p>
                <h2 className="mt-1.5 text-[20px] font-extrabold leading-snug">{post.title}</h2>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]">{post.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand />
    </>
  );
}
