"use client";

import * as React from "react";
import { Braces } from "lucide-react";
import { Textarea } from "@/components/ui";
import { fuzzyFilter } from "@/lib/fuzzy";
import { previewTemplate, tokensIn } from "@/lib/engine/template";
import { cn } from "@/lib/utils";

export type TokenOption = { token: string; description: string };

/**
 * A message box that knows its {{fields}}. Typing "{{" opens a list of the
 * fields this message can use, filtered as you type ("{{fi" → first_name);
 * Enter or Tab puts one in. The fields are also listed under the box to click,
 * a field it doesn't know is flagged before it goes out blank, and a preview
 * shows the message with sample values.
 */
export function TokenTextarea({
  value,
  onChange,
  tokens,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  tokens: TokenOption[];
  placeholder?: string;
  maxLength?: number;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);
  const listId = React.useId();

  // An unfinished "{{na" right before the caret.
  const typing = /\{\{\s*([\w.]*)$/.exec(value.slice(0, caret));
  const query = typing?.[1] ?? "";
  const matches = typing ? fuzzyFilter(tokens, query, (t) => t.token).slice(0, 8) : [];
  const open = focused && Boolean(typing) && dismissedAt !== caret && matches.length > 0;

  React.useEffect(() => setActive(0), [query]);

  const known = new Set(tokens.map((t) => t.token));
  const unknown = tokensIn(value).filter((t) => !known.has(t));

  function place(next: string, at: number) {
    onChange(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
      setCaret(at);
    });
  }

  /** Complete the "{{na" being typed. */
  function complete(token: string) {
    if (!typing) return;
    const start = caret - typing[0].length;
    const after = value.slice(caret).replace(/^\s*\}\}/, "");
    const insert = `{{${token}}}`;
    place(value.slice(0, start) + insert + after, start + insert.length);
  }

  /** Put a field in at the caret, from the list under the box. */
  function insertAtCaret(token: string) {
    const at = ref.current && focused ? ref.current.selectionStart : value.length;
    const insert = `{{${token}}}`;
    const spacer = at > 0 && !/\s$/.test(value.slice(0, at)) ? " " : "";
    place(value.slice(0, at) + spacer + insert + value.slice(at), at + spacer.length + insert.length);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      complete(matches[active].token);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissedAt(caret);
    }
  }

  const sample = Object.fromEntries(tokens.map((t) => [t.token, `‹${t.token}›`]));
  const preview = value.includes("{{") ? previewTemplate(value, { ...sample, ...SAMPLE }) : "";

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={ref}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {open && (
          <div
            id={listId}
            role="listbox"
            className="absolute left-2 right-2 top-full z-30 -mt-1 max-h-64 overflow-auto rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-1 shadow-[4px_4px_0_0_var(--shadow-ink)]"
          >
            {matches.map((t, i) => (
              <div
                key={t.token}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  complete(t.token);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5",
                  i === active && "bg-[var(--bg-sunken)]",
                )}
              >
                <span className="font-mono text-[12.5px]">{`{{${t.token}}}`}</span>
                <span className="truncate text-[11.5px] text-[var(--text-faint)]">{t.description}</span>
              </div>
            ))}
            <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] text-[var(--text-faint)]">↑ ↓ to choose, Enter to insert, Esc to close</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text-muted)]">
          <Braces className="h-3.5 w-3.5" /> Insert a field:
        </span>
        {tokens.map((t) => (
          <button
            key={t.token}
            type="button"
            title={t.description}
            // mousedown keeps the caret where it was in the box
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertAtCaret(t.token)}
            className="rounded-lg border border-[var(--border)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {`{{${t.token}}}`}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] text-[var(--text-faint)]">
        Or type <span className="font-mono">{"{{"}</span> in the message to pick one. A field the person doesn&rsquo;t have is left blank.
      </p>

      {unknown.length > 0 && (
        <p className="text-[12px] font-semibold text-[var(--color-zap-500)]">
          {unknown.map((t) => `{{${t}}}`).join(", ")} {unknown.length === 1 ? "isn't a field" : "aren't fields"} this message
          can use, so {unknown.length === 1 ? "it" : "they"} would be left blank.
        </p>
      )}

      {preview && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2">
          <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-faint)]">Preview</p>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{preview}</p>
        </div>
      )}
    </div>
  );
}

/** Sample values for the preview, so it reads like a real message. */
const SAMPLE: Record<string, string> = {
  first_name: "Alex",
  full_name: "Alex Rivera",
  username: "alexrivera",
  account_username: "yourbrand",
};
