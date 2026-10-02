/**
 * Small fuzzy matching for pickers: "vp" finds "vip", "lead" finds
 * "hot-lead". Case-insensitive. Higher scores are better matches; null means
 * no match at all.
 *
 * Ranked: exact, then prefix, then a word that starts with the query, then
 * the query anywhere, then its letters in order (a subsequence), where
 * letters closer together score higher.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - t.length;
  if (new RegExp(`(^|[^a-z0-9])${escape(q)}`).test(t)) return 600 - t.length;
  const at = t.indexOf(q);
  if (at >= 0) return 400 - at - t.length;

  // Letters in order, penalised for the gaps between them.
  let ti = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    if (last >= 0) gaps += found - last - 1;
    last = found;
    ti = found + 1;
  }
  return 200 - gaps * 5 - t.length;
}

/** The items that match, best first. An empty query keeps the original order. */
export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, text(item)) }))
    .filter((x): x is { item: T; index: number; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
