"use client";

import * as React from "react";
import { Tag, X } from "lucide-react";
import { fuzzyFilter } from "@/lib/fuzzy";
import { cn } from "@/lib/utils";

export type TagOption = { tag: string; count: number };

/**
 * Pick tags from the ones the account actually uses, with fuzzy search.
 * Typing narrows the list ("vp" finds "vip"); Enter adds the highlighted tag,
 * Backspace on an empty box removes the last one.
 */
export function TagPicker({
  options,
  value,
  onChange,
  placeholder = "Search tags",
  emptyHint = "No tags yet. Tag contacts on the Contacts page or with a Tag step in an automation.",
}: {
  options: TagOption[];
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  emptyHint?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const available = options.filter((o) => !value.includes(o.tag));
  const matches = fuzzyFilter(available, query, (o) => o.tag).slice(0, 50);

  React.useEffect(() => setActive(0), [query, open]);

  function add(tag: string) {
    onChange([...value, tag]);
    setQuery("");
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      if (open && matches[active] && (e.key !== "Tab" || query)) {
        e.preventDefault();
        add(matches[active].tag);
      }
    } else if (e.key === "Backspace" && !query && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1.5 transition-shadow",
          open && "shadow-[3px_3px_0_0_var(--color-pow-400)]",
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)]/12 py-0.5 pl-2 pr-1 font-mono text-[11.5px] text-[var(--accent)]"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((t) => t !== tag));
              }}
              className="rounded p-0.5 hover:bg-[var(--accent)]/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value.replace(/,/g, ""));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-[6rem] flex-1 bg-transparent px-1 text-sm placeholder:font-medium placeholder:text-[var(--text-faint)] focus:outline-none"
        />
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-64 overflow-auto rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-1 shadow-[4px_4px_0_0_var(--shadow-ink)]"
        >
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-[var(--text-muted)]">
              {options.length === 0
                ? emptyHint
                : available.length === 0
                  ? "Every tag is already picked."
                  : `No tag matches "${query}".`}
            </p>
          ) : (
            matches.map((option, i) => (
              <div
                key={option.tag}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, so the box keeps focus and doesn't close first
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(option.tag);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-[13px]",
                  i === active && "bg-[var(--bg-sunken)]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
                  <span className="truncate font-mono text-[12.5px]">{option.tag}</span>
                </span>
                <span className="shrink-0 text-[11.5px] text-[var(--text-faint)]">
                  {option.count.toLocaleString()} {option.count === 1 ? "contact" : "contacts"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
