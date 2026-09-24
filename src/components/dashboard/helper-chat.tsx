"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Check, Loader2, RotateCcw, Sparkles, Workflow } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The AI Helper chat. See docs/HELPER.md.
 *
 * The conversation lives in this tab only (sessionStorage), and goes back to
 * the server with each question so the helper keeps the thread. Answers
 * stream in as newline-delimited JSON events from /api/helper.
 */

type Proposal = {
  accountId: string;
  accountUsername: string;
  name: string;
  triggerType: string;
  matchMode: string;
  keywords: string[];
  scope: string;
  presetId: string;
  presetName: string;
  customize: Record<string, unknown>;
  steps: string[];
};

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** What to show, in the order it arrived — text, then a draft, then more text. */
  parts?: Array<{ kind: "text"; text: string } | { kind: "proposal"; proposal: Proposal }>;
  status?: string;
  proposals?: Proposal[];
  error?: string;
  truncated?: boolean;
  pending?: boolean;
};

type HelperEvent =
  | { type: "text"; text: string }
  | { type: "status"; text: string }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; truncated?: boolean }
  | { type: "error"; message: string };

const STORAGE_KEY = "idm-helper-chat";

const SUGGESTIONS = [
  "How do I schedule a post and switch an automation on when it goes live?",
  "I sell an ebook. Set up comment-to-DM so people who comment BOOK get the link.",
  "Why didn't my automation send anything?",
  "How do I collect emails and send them to Google Sheets?",
  "What's the best way to grow followers with DMs without breaking Instagram's rules?",
  "What does Slow Down mode do?",
];

const TRIGGER_LABEL: Record<string, string> = {
  COMMENT: "Comment on a post or Reel",
  STORY_REPLY: "Story reply or reaction",
  STORY_MENTION: "Story @mention",
  LIVE_COMMENT: "Live comment",
  DM_KEYWORD: "DM keyword",
  AD_COMMENT: "Comment on an ad",
  ICE_BREAKER: "Conversation starter",
};

const newId = () => Math.random().toString(36).slice(2, 10);

export function HelperChat({
  available,
  remaining: initialRemaining,
  upgradeTo,
  from,
}: {
  available: boolean;
  /** Questions left this week; null when unlimited. */
  remaining: number | null;
  /** The plan with more questions, if there is one to move to. */
  upgradeTo?: string;
  from?: string;
}) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [remaining, setRemaining] = React.useState(initialRemaining);
  const endRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Restore this tab's conversation. Storage can be unavailable (private
  // windows, blocked site data) — the chat just starts empty then.
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setTurns((JSON.parse(saved) as Turn[]).filter((t) => !t.pending));
    } catch {
      // Start fresh.
    }
    return () => abortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-40)));
    } catch {
      // Not saved; nothing else depends on it.
    }
  }, [turns]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const update = (id: string, change: (turn: Turn) => Turn) =>
    setTurns((all) => all.map((t) => (t.id === id ? change(t) : t)));

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const history = turns
      .filter((t) => !t.error && t.text.trim())
      .slice(-10)
      .map((t) => {
        // Drafts it offered are cards, not text; tell it what it already offered.
        const drafts = t.proposals?.length ? `\n\n(Draft offered: ${t.proposals.map((p) => p.name).join(", ")})` : "";
        return { role: t.role, content: `${t.text}${drafts}`.slice(0, 3000) };
      });
    const answerId = newId();
    setTurns((all) => [
      ...all,
      { id: newId(), role: "user", text },
      { id: answerId, role: "assistant", text: "", pending: true, status: "Thinking…" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, page: from }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "The helper couldn't answer just now. Please try again.");
      }
      if (remaining !== null) setRemaining((r) => (r === null ? r : Math.max(0, r - 1)));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as HelperEvent;
          if (event.type === "text") {
            update(answerId, (t) => {
              const parts = [...(t.parts ?? [])];
              const last = parts.at(-1);
              if (last?.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + event.text };
              else parts.push({ kind: "text", text: event.text });
              return { ...t, text: t.text + event.text, parts, status: undefined };
            });
          } else if (event.type === "status") update(answerId, (t) => ({ ...t, status: event.text }));
          else if (event.type === "proposal")
            update(answerId, (t) => ({
              ...t,
              proposals: [...(t.proposals ?? []), event.proposal],
              parts: [...(t.parts ?? []), { kind: "proposal", proposal: event.proposal }],
              status: undefined,
            }));
          else if (event.type === "error") update(answerId, (t) => ({ ...t, error: event.message }));
          else if (event.type === "done") update(answerId, (t) => ({ ...t, truncated: event.truncated }));
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) update(answerId, (t) => ({ ...t, error: (error as Error).message }));
    } finally {
      update(answerId, (t) => ({ ...t, pending: false, status: undefined }));
      setBusy(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setTurns([]);
    setBusy(false);
  }

  if (!available) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="The AI Helper is taking a break"
        description="It's unavailable on our side right now. Please check back soon — everything else works as normal."
      />
    );
  }

  const outOfQuestions = remaining === 0;

  return (
    <div className="flex min-h-[60vh] flex-col rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] shadow-[4px_4px_0_0_var(--shadow-ink)]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--border-soft)] px-4 py-2.5">
        <p className="text-[12px] font-medium text-[var(--text-muted)]">
          {remaining === null
            ? "Answers come from InstaDM247's own guide and your account's setup."
            : `${remaining} question${remaining === 1 ? "" : "s"} left this week`}
          {outOfQuestions && upgradeTo && (
            <>
              {" · "}
              <Link href="/dashboard/billing" className="font-semibold text-[var(--accent)] underline underline-offset-2">
                {upgradeTo} has more
              </Link>
            </>
          )}
        </p>
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> New chat
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5" aria-live="polite">
        {turns.length === 0 ? (
          <div className="space-y-4">
            <p className="text-[13.5px] text-[var(--text-muted)]">
              Ask anything about InstaDM247. It can walk you through a feature step by step, plan automations for a
              goal and draft them for you, or look at your account to explain why something didn&rsquo;t send. It
              can&rsquo;t change anything on its own.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={outOfQuestions}
                  className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors hover:bg-[var(--color-pow-400)]/25 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => <TurnView key={turn.id} turn={turn} />)
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex items-end gap-2 border-t-2 border-[var(--border-soft)] p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask(input);
            }
          }}
          rows={2}
          maxLength={2000}
          disabled={outOfQuestions}
          placeholder={
            outOfQuestions ? "You've used this week's questions. They reset on Monday." : "How do I… / Help me set up… / Why didn't…"
          }
          aria-label="Ask the AI Helper"
          className="min-h-[44px] flex-1 resize-none rounded-xl border-2 border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--accent)] disabled:opacity-60"
        />
        <Button type="submit" variant="primary" size="icon" disabled={!input.trim() || busy || outOfQuestions} aria-label="Send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border-2 border-[var(--border)] bg-[var(--color-pow-400)]/40 px-3.5 py-2 text-[13.5px]">
          {turn.text}
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-[var(--border)] bg-[var(--color-pow-400)] text-[#12110e]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {(turn.parts ?? (turn.text ? [{ kind: "text" as const, text: turn.text }] : [])).map((part, i) =>
          part.kind === "text" ? (
            <Markdown key={i} text={part.text} />
          ) : (
            <ProposalCard key={i} proposal={part.proposal} />
          ),
        )}
        {turn.status && (
          <p className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {turn.status}
          </p>
        )}
        {turn.truncated && (
          <p className="text-[12px] text-[var(--text-faint)]">That answer was cut short — ask it to continue.</p>
        )}
        {turn.error && <p className="text-[13px] font-medium text-[var(--color-zap-500)]">{turn.error}</p>}
      </div>
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [createdId, setCreatedId] = React.useState<string | null>(null);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: proposal.accountId,
          name: proposal.name,
          triggerType: proposal.triggerType,
          scope: proposal.scope,
          matchMode: proposal.matchMode,
          keywords: proposal.keywords,
          presetId: proposal.presetId,
          customize: proposal.customize,
        }),
      });
      const data = (await res.json()) as { automation?: { id: string }; error?: string };
      if (!res.ok || !data.automation) throw new Error(data.error ?? "Could not create the automation");
      setCreatedId(data.automation.id);
      toast.success("Draft created — it's switched off until you turn it on");
      router.push(`/dashboard/automations/${data.automation.id}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const match =
    proposal.matchMode === "KEYWORD"
      ? `Keywords: ${proposal.keywords.join(", ")}`
      : proposal.matchMode === "REACTION"
        ? "Emoji reactions only"
        : proposal.matchMode === "REPLY"
          ? "Written replies only"
          : "Everyone";

  return (
    <div className="rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-subtle)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Workflow className="h-4 w-4 text-[var(--accent)]" />
        <p className="text-[14px] font-extrabold">{proposal.name}</p>
        <Badge tone="neutral">Draft</Badge>
      </div>
      <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
        @{proposal.accountUsername} · {TRIGGER_LABEL[proposal.triggerType] ?? proposal.triggerType} · {match} · from
        &ldquo;{proposal.presetName}&rdquo;
      </p>
      <ol className="mt-3 space-y-1 text-[12.5px]">
        {proposal.steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-[var(--text-faint)]">{i + 1}.</span>
            <span className="min-w-0 break-words">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {createdId ? (
          <Link href={`/dashboard/automations/${createdId}`}>
            <Button variant="secondary" size="sm">
              <Check className="h-3.5 w-3.5" /> Created — open it
            </Button>
          </Link>
        ) : (
          <Button variant="primary" size="sm" onClick={create} loading={creating}>
            Create draft
          </Button>
        )}
        <p className="text-[11.5px] text-[var(--text-faint)]">Created switched off. Review it in the builder, then turn it on.</p>
      </div>
    </div>
  );
}

/**
 * The small slice of markdown the helper writes: paragraphs, numbered and
 * bulleted lists, bold, inline code and links. Built as React elements — never
 * as HTML — so nothing in an answer can inject markup. Links go only to our
 * own dashboard paths or to https pages, which open in a new tab.
 */
function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+/;
    const bullet = /^\s*[-*•]\s+/;
    if (ordered.test(line) || bullet.test(line)) {
      const isOrdered = ordered.test(line);
      const items: string[] = [];
      while (i < lines.length && (isOrdered ? ordered : bullet).test(lines[i])) {
        items.push(lines[i].replace(isOrdered ? ordered : bullet, ""));
        i++;
        // Wrapped continuation lines belong to the item above.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !ordered.test(lines[i]) && !bullet.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        }
      }
      const List = isOrdered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length} className={cn("space-y-1.5 pl-5", isOrdered ? "list-decimal" : "list-disc")}>
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const heading = /^#{1,6}\s+/;
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !ordered.test(lines[i]) && !bullet.test(lines[i])) {
      paragraph.push(lines[i].replace(heading, ""));
      i++;
    }
    const isHeading = heading.test(line);
    blocks.push(
      <p key={blocks.length} className={cn(isHeading && "font-extrabold text-[var(--text)]")}>
        {inline(paragraph.join(" "))}
      </p>,
    );
  }
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--text)] [&_strong]:font-extrabold">
      {blocks}
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2]) {
      parts.push(
        <code key={key++} className="rounded bg-[var(--bg-sunken)] px-1 py-0.5 text-[12.5px]">
          {match[2]}
        </code>,
      );
    } else {
      const href = match[4];
      const style = "font-semibold text-[var(--accent)] underline underline-offset-2";
      if (/^\/dashboard(\/[\w-]+)*(\?[\w=&%-]*)?$/.test(href)) {
        parts.push(
          <Link key={key++} href={href} className={style}>
            {match[3]}
          </Link>,
        );
      } else if (href.startsWith("https://")) {
        parts.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className={style}>
            {match[3]}
          </a>,
        );
      } else {
        parts.push(match[3]);
      }
    }
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
