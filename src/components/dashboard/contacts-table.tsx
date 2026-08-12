"use client";

import * as React from "react";
import { Search, ShieldOff } from "lucide-react";
import { Badge, Input, Select } from "@/components/ui";
import { cn, initials, timeAgo, windowCountdown } from "@/lib/utils";

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

export function ContactsTable({
  contacts,
  allTags,
}: {
  contacts: Contact[];
  allTags: string[];
}) {
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [status, setStatus] = React.useState("all");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (tag && !contact.tags.includes(tag)) return false;

      if (status === "reachable") {
        const window = windowCountdown(contact.windowExpiresAt);
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
  }, [contacts, query, tag, status]);

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

      <p className="text-[12.5px] text-[var(--text-muted)]">
        {filtered.length.toLocaleString()} of {contacts.length.toLocaleString()} contacts
      </p>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] bg-[var(--bg-sunken)]">
              <tr>
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
                const window = windowCountdown(contact.windowExpiresAt);
                return (
                  <tr
                    key={contact.id}
                    className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
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
                            @{contact.username ?? contact.igsid.slice(0, 10)}
                          </span>
                          {contact.name && (
                            <span className="block truncate text-[11.5px] text-[var(--text-faint)]">
                              {contact.name}
                            </span>
                          )}
                        </span>
                        {contact.optedOut && (
                          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-red-400" aria-label="Opted out" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.length === 0 ? (
                          <span className="text-[var(--text-faint)]">—</span>
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
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {contact.isFollower === null ? (
                        <span className="text-[var(--text-faint)]">Unknown</span>
                      ) : contact.isFollower ? (
                        <span className="text-emerald-400">Yes</span>
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
                              ? "text-amber-400"
                              : "text-emerald-400",
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
