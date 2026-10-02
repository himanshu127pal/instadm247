// Shared by the browser (tag pickers) and the server.

/**
 * A tag as typed, made consistent: trimmed, runs of spaces collapsed, and no
 * commas (a comma inside a tag would read as two in an export). Case is kept,
 * as the Tag step keeps it. Empty means not a tag.
 */
export function normalizeTag(raw: string): string {
  return raw.replace(/,/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}
