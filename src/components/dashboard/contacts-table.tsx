"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Search, ShieldOff } from "lucide-react";
import { Badge, Button, Input, Select } from "@/components/ui";
import { cn, contactLabel, initials, timeAgo, windowCountdown } from "@/lib/utils";
import { useNow } from "./use-now";
import { TagPicker, type TagOption } from "./tag-picker";

type Contact = {
  id: string;
  igsid: string;
  username: string | null;
  name: string | null;
  profilePicUrl: string | null;
  tags: string[];
  isFollower: boolean | null;
  optedOut: boolean;
  lastInteractionAt: string | null;
  windowExpiresAt: string | null;
  accountUsername: string;
  customFields: Record<string, unknown>;
};

/** Add and remove tags on contacts. Throws with a message to show. */
async function changeTags(contactIds: string[], change: { add?: string[]; remove?: string[] }) {
  const res = await fetch("/api/contacts/tags", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactIds, ...change }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "The tags couldn't be saved. Please try again.");
  }
}

export function ContactsTable({
  contacts: initial,
  allTags,
  tagCounts,
}: {
  contacts: Contact[];
  allTags: string[];
  tagCounts: TagOption[];
}) {
  const router = useRouter();
  // Edited in place, then re-synced from the server.
  const [contacts, setContacts] = React.useState(initial);
  React.useEffect(() => setContacts(initial), [initial]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<string | null>(null);
  const [bulkTags, setBulkTags] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Tags to offer: every tag in use, with counts, plus any just added here.
  const options = React.useMemo(() => {
    const known = new Map(tagCounts.map((t) => [t.tag, t.count]));
    for (const c of contacts) for (const t of c.tags) if (!known.has(t)) known.set(t, 1);
    return [...known].map(([tag, count]) => ({ tag, count }));
  }, [tagCounts, contacts]);

  /** Apply a change here at once, save it, and put it back if saving fails. */
  async function apply(ids: string[], change: { add?: string[]; remove?: string[] }) {
    const before = contacts;
    const remove = new Set(change.remove ?? []);
    setContacts((all) =>
      all.map((c) =>
        ids.includes(c.id)
          ? { ...c, tags: [...c.tags.filter((t) => !remove.has(t)), ...(change.add ?? []).filter((t) => !c.tags.includes(t))] }
          : c,
      ),
    );
    try {
      await changeTags(ids, change);
      router.refresh();
      return true;
    } catch (error) {
      setContacts(before);
      toast.error((error as Error).message);
      return false;
    }
  }

  async function bulk(kind: "add" | "remove") {
    if (bulkTags.length === 0) return;
    setBusy(true);
    const ids = [...selected];
    const done = await apply(ids, kind === "add" ? { add: bulkTags } : { remove: bulkTags });
    setBusy(false);
    if (done) {
      toast.success(
        `${kind === "add" ? "Added" : "Removed"} ${bulkTags.map((t) => `"${t}"`).join(", ")} ${kind === "add" ? "to" : "from"} ${ids.length} contact${ids.length === 1 ? "" : "s"}`,
      );
      setBulkTags([]);
    }
  }

  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const now = useNow();

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (tag && !contact.tags.includes(tag)) return false;

      if (status === "reachable") {
        const window = windowCountdown(contact.windowExpiresAt, now);
        if (!window.open || contact.optedOut) return false;
      }
      if (status === "followers" && contact.isFollower !== true) return false;
      if (status === "non-followers" && contact.isFollower !== false) return false;
      if (status === "opted-out" && !contact.optedOut) return false;

      if (!needle) return true;
      return (
        (contact.username ?? "").toLowerCase().includes(needle) ||
        (contact.name ?? "").toLowerCase().includes(needle) ||
        contact.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [contacts, query, tag, status, now]);

  return (
    <div className="space-y-3">
      {/* Filters live in one row above the table */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, handle or tag"
            className="pl-8"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[160px]">
          <option value="all">Everyone</option>
          <option value="reachable">Reachable now</option>
          <option value="followers">Followers</option>
          <option value="non-followers">Not following</option>
          <option value="opted-out">Opted out</option>
        </Select>
        {allTags.length > 0 && (
          <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        )}
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-2.5">
          <span className="text-[13px] font-semibold">{selected.size.toLocaleString()} selected</span>
          <div className="min-w-[220px] flex-1">
            <TagPicker options={options} value={bulkTags} onChange={setBulkTags} allowCreate placeholder="Tags to add or remove" />
          </div>
          <Button size="sm" variant="primary" disabled={!bulkTags.length} loading={busy} onClick={() => void bulk("add")}>
            Add to {selected.size.toLocaleString()}
          </Button>
          <Button size="sm" variant="secondary" disabled={!bulkTags.length || busy} onClick={() => void bulk("remove")}>
            Remove from {selected.size.toLocaleString()}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : (
        <p className="text-[12.5px] text-[var(--text-muted)]">
          {filtered.length.toLocaleString()} of {contacts.length.toLocaleString()} contacts. Tick contacts to tag several at once.
        </p>
      )}

      <div className="overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="border-b-2 border-[var(--border-soft)] bg-[var(--bg-sunken)]">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const c of filtered) {
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                {["Contact", "Tags", "Follows you", "Messaging window", "Last seen", "Account"].map(
                  (header) => (
                    <th
                      key={header}
                      className="px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-wider text-[var(--text-faint)]"
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => {
                const window = windowCountdown(contact.windowExpiresAt, now);
                return (
                  <tr
                    key={contact.id}
                    className={cn(
                      "border-b-2 border-[var(--border-soft)] last:border-0 transition-colors hover:bg-[var(--bg-subtle)]",
                      selected.has(contact.id) && "bg-[var(--bg-subtle)]",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${contactLabel(contact)}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={selected.has(contact.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(contact.id);
                            else next.delete(contact.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {contact.profilePicUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={contact.profilePicUrl}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--bg-sunken)] text-[10px] font-semibold">
                            {initials(contact.username ?? contact.name, "?")}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {contactLabel(contact)}
                          </span>
                          {contact.name && (
                            <span className="block truncate text-[11.5px] text-[var(--text-faint)]">
                              {contact.name}
                            </span>
                          )}
                        </span>
                        {contact.optedOut && (
                          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-[var(--color-zap-500)]" aria-label="Opted out" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {editing === contact.id ? (
                        <div className="flex min-w-[240px] items-start gap-1.5">
                          <div className="flex-1">
                            <TagPicker
                              options={options}
                              value={contact.tags}
                              allowCreate
                              autoFocus
                              placeholder="Add a tag"
                              onChange={(next) => {
                                const add = next.filter((t) => !contact.tags.includes(t));
                                const remove = contact.tags.filter((t) => !next.includes(t));
                                void apply([contact.id], { add, remove });
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            aria-label="Done"
                            onClick={() => setEditing(null)}
                            className="mt-1.5 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="group flex flex-wrap items-center gap-1">
                          {contact.tags.length === 0 ? (
                            <span className="text-[var(--text-faint)]">No tags</span>
                          ) : (
                            contact.tags.slice(0, 3).map((t) => (
                              <Badge key={t} tone="brand">
                                {t}
                              </Badge>
                            ))
                          )}
                          {contact.tags.length > 3 && (
                            <span className="text-[11px] text-[var(--text-faint)]">
                              +{contact.tags.length - 3}
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`Edit tags for ${contactLabel(contact)}`}
                            onClick={() => setEditing(contact.id)}
                            className="rounded-md p-1 text-[var(--text-faint)] opacity-60 transition-opacity hover:bg-[var(--bg-sunken)] hover:text-[var(--text)] group-hover:opacity-100 focus:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {contact.isFollower === null ? (
                        <span className="text-[var(--text-faint)]">Unknown</span>
                      ) : contact.isFollower ? (
                        <span className="text-[var(--color-boom-500)]">Yes</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          window.urgency === "closed"
                            ? "text-[var(--text-faint)]"
                            : window.urgency === "closing"
                              ? "text-[var(--color-zonk-500)]"
                              : "text-[var(--color-boom-500)]",
                        )}
                      >
                        {window.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {timeAgo(contact.lastInteractionAt)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      @{contact.accountUsername}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">
            No contacts match those filters.
          </p>
        )}
      </div>
    </div>
  );
}
