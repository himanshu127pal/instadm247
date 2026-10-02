"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { fuzzyScore } from "@/lib/fuzzy";

/** Filter the docs as you type: titles first, then what they're about. */
type SearchDoc = { slug: string; title: string; summary: string; group: string; text: string };

/**
 * Every word has to appear somewhere in the doc (a word can be the start of
 * a longer one: "react" finds "reactions"). Title hits rank first; a typo in
 * a title still finds it.
 */
export function searchDocs(docs: SearchDoc[], query: string): SearchDoc[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return docs
    .map((d, i) => {
      const title = d.title.toLowerCase();
      const all = `${title} ${d.summary.toLowerCase()} ${d.text.toLowerCase()}`;
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 10;
        else if (all.includes(w)) score += 3;
        else if ((fuzzyScore(w, title) ?? -1) >= 150) score += 1;
        else return null;
      }
      return { d, i, score };
    })
    .filter((x): x is { d: SearchDoc; i: number; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.d);
}

export function DocsSearch({ docs }: { docs: SearchDoc[] }) {
  const [q, setQ] = React.useState("");
  const hits = searchDocs(docs, q).slice(0, 8);
  return (
    <div className="relative mt-8 max-w-xl">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the docs, e.g. story reactions, broadcasts, follow"
        aria-label="Search the docs"
        className="h-12 w-full rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] pl-11 pr-4 text-[15px] shadow-[4px_4px_0_0_var(--shadow-ink)] focus:outline-none"
      />
      {q.trim() && (
        <ul className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] shadow-[4px_4px_0_0_var(--shadow-ink)]">
          {hits.length === 0 ? (
            <li className="px-4 py-3 text-[14px] text-[var(--text-muted)]">Nothing matches. Try another word.</li>
          ) : (
            hits.map((d) => (
              <li key={d.slug}>
                <Link href={`/docs/${d.slug}`} className="block px-4 py-2.5 hover:bg-[var(--bg-subtle)]">
                  <span className="block text-[14.5px] font-bold">{d.title}</span>
                  <span className="block truncate text-[12.5px] text-[var(--text-muted)]">{d.group} · {d.summary}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
