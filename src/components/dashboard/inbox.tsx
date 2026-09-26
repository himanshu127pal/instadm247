"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Bot,
  Clock,
  Inbox as InboxIcon,
  Search,
  Send,
  ShieldOff,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { Badge, Button, EmptyState, Input, Switch } from "@/components/ui";
import { cn, initials, timeAgo, windowCountdown } from "@/lib/utils";
import { AlertToggles, playChime, showDesktopAlert, useAlertPrefs, useInboxLive } from "./inbox-live";

type Contact = {
  id: string;
  igsid: string;
  username: string | null;
  name: string | null;
  profilePicUrl: string | null;
  tags: string[];
  isFollower: boolean | null;
  windowExpiresAt: string | null;
  optedOut: boolean;
};

type Conversation = {
  id: string;
  accountId: string;
  accountUsername: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  status: string;
  humanTakeover: boolean;
  contact: Contact;
};

type Message = {
  id: string;
  direction: string;
  kind: string;
  text: string | null;
  source: string;
  status: string;
  skipReason: string | null;
  failReason: string | null;
  humanAgentTag: boolean;
  createdAt: string;
};

export function InboxView({
  conversations: initial,
  loadedAt,
}: {
  conversations: Conversation[];
  /** When the server read the list — the live refresh asks for changes since. */
  loadedAt: string;
}) {
  const [conversations, setConversations] = React.useState(initial);
  const [activeId, setActiveId] = React.useState<string | null>(initial[0]?.id ?? null);
  const [prefs, updatePrefs] = useAlertPrefs();

  const activeRef = React.useRef(activeId);
  activeRef.current = activeId;
  useInboxLive({
    loadedAt,
    setConversations,
    onIncoming: (conversation) => {
      // Already reading this thread with the tab in front: they can see it.
      const watching = conversation.id === activeRef.current && !document.hidden;
      if (watching) {
        updateConversation(conversation.id, { unreadCount: 0 });
        return;
      }
      if (prefs.sound) playChime();
      if (prefs.desktop && document.hidden) {
        showDesktopAlert(conversation, () => {
          setActiveId(conversation.id);
          updateConversation(conversation.id, { unreadCount: 0 });
        });
      }
    },
  });
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "unread" | "human">("all");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "unread" && c.unreadCount === 0) return false;
      if (filter === "human" && !c.humanTakeover) return false;
      if (!needle) return true;
      return (
        (c.contact.username ?? "").toLowerCase().includes(needle) ||
        (c.contact.name ?? "").toLowerCase().includes(needle) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(needle)
      );
    });
  }, [conversations, query, filter]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  function updateConversation(id: string, changes: Partial<Conversation>) {
    setConversations((current) =>
      current.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    );
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="No conversations yet"
        description="As soon as someone comments, replies to a story or messages you, the thread lands here."
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[560px] overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)]">
      {/* Thread list */}
      <div
        className={cn(
          "flex w-full flex-col border-r-[2.5px] border-[var(--border)] md:w-[320px] md:shrink-0",
          active && "hidden md:flex",
        )}
      >
        <div className="space-y-2.5 border-b-2 border-[var(--border-soft)] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: "all", label: "All" },
                { id: "unread", label: "Unread" },
                { id: "human", label: "Yours" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[12px] transition-colors",
                  filter === option.id
                    ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
                )}
              >
                {option.label}
              </button>
            ))}
            <div className="ml-auto">
              <AlertToggles prefs={prefs} update={updatePrefs} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-[var(--text-muted)]">
              Nothing matches that.
            </p>
          ) : (
            filtered.map((conversation) => {
              const window = windowCountdown(conversation.contact.windowExpiresAt);
              return (
                <button
                  key={conversation.id}
                  onClick={() => {
                    setActiveId(conversation.id);
                    updateConversation(conversation.id, { unreadCount: 0 });
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b-2 border-[var(--border-soft)] p-3 text-left transition-colors",
                    conversation.id === activeId
                      ? "bg-[var(--accent)]/8"
                      : "hover:bg-[var(--bg-subtle)]",
                  )}
                >
                  <Avatar contact={conversation.contact} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">
                        @{conversation.contact.username ?? conversation.contact.igsid.slice(0, 8)}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-[var(--text-faint)]">
                        {timeAgo(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                      {conversation.lastMessagePreview ?? "No messages yet"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {conversation.unreadCount > 0 && (
                        <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-[var(--accent-contrast)]">
                          {conversation.unreadCount}
                        </span>
                      )}
                      {conversation.humanTakeover && (
                        <span className="text-[10px] text-[var(--color-zonk-500)]">You&rsquo;re handling this</span>
                      )}
                      <span
                        className={cn(
                          "text-[10px]",
                          window.urgency === "closed"
                            ? "text-[var(--text-faint)]"
                            : window.urgency === "closing"
                              ? "text-[var(--color-zonk-500)]"
                              : "text-[var(--color-boom-500)]",
                        )}
                      >
                        {window.label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Thread */}
      {active ? (
        <Thread
          key={active.id}
          conversation={active}
          onBack={() => setActiveId(null)}
          onUpdate={(changes) => updateConversation(active.id, changes)}
        />
      ) : (
        <div className="hidden flex-1 place-items-center md:grid">
          <p className="text-[13px] text-[var(--text-muted)]">
            Pick a conversation to read it.
          </p>
        </div>
      )}
    </div>
  );
}

function Avatar({ contact }: { contact: Contact }) {
  if (contact.profilePicUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={contact.profilePicUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-kapow-400),var(--color-zap-500))] text-[12px] font-semibold text-white">
      {initials(contact.username ?? contact.name, "?")}
    </span>
  );
}

function Thread({
  conversation,
  onBack,
  onUpdate,
}: {
  conversation: Conversation;
  onBack: () => void;
  onUpdate: (changes: Partial<Conversation>) => void;
}) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const window = windowCountdown(conversation.contact.windowExpiresAt);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/conversations/${conversation.id}`)
      .then((res) => res.json())
      .then((data: { messages?: Message[] }) => {
        if (!cancelled) setMessages(data.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load this conversation.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  // New activity in the open thread (the live refresh moved lastMessageAt):
  // reload quietly, without the loading state.
  const firstLoad = React.useRef(true);
  React.useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    fetch(`/api/conversations/${conversation.id}`)
      .then((res) => res.json())
      .then((data: { messages?: Message[] }) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch(() => undefined);
  }, [conversation.id, conversation.lastMessageAt]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { messages?: Message[]; error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Could not send that message.");
        return;
      }
      setMessages(data.messages ?? []);
      setDraft("");
      onUpdate({ humanTakeover: true, lastMessagePreview: text });
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setSending(false);
    }
  }

  async function toggleTakeover(next: boolean) {
    onUpdate({ humanTakeover: next });
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ humanTakeover: next }),
    });
    toast.success(next ? "Automation paused for this thread" : "Automation resumed");
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--border-soft)] px-4 py-3">
        <button onClick={onBack} className="text-[13px] text-[var(--text-muted)] md:hidden">
          ← Back
        </button>
        <Avatar contact={conversation.contact} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">
            @{conversation.contact.username ?? conversation.contact.igsid.slice(0, 10)}
          </p>
          <p className="truncate text-[11.5px] text-[var(--text-faint)]">
            via @{conversation.accountUsername}
            {conversation.contact.isFollower === true && " · follows you"}
            {conversation.contact.isFollower === false && " · not following"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {conversation.contact.optedOut && (
            <Badge tone="danger">
              <ShieldOff className="h-3 w-3" /> Opted out
            </Badge>
          )}
          <Badge tone={window.urgency === "closed" ? "neutral" : window.urgency === "closing" ? "warning" : "success"}>
            <Clock className="h-3 w-3" />
            {window.label}
          </Badge>
        </div>
      </header>

      {conversation.contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b-2 border-[var(--border-soft)] px-4 py-2">
          {conversation.contact.tags.map((tag) => (
            <Badge key={tag} tone="brand">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-[13px] text-[var(--text-muted)]">
            No messages in this thread yet.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t-2 border-[var(--border-soft)] p-3">
        <label className="mb-2.5 flex items-center gap-2.5 rounded-xl border-2 border-[var(--border)] px-3 py-2">
          <Switch
            checked={conversation.humanTakeover}
            onCheckedChange={toggleTakeover}
            label="Pause automation for this thread"
          />
          <span className="min-w-0 flex-1 text-[12px] text-[var(--text-muted)]">
            {conversation.humanTakeover
              ? "You're handling this. Automations won't message this person."
              : "Automations are still running for this conversation."}
          </span>
        </label>

        {!window.open ? (
          <p className="rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)]/40 shadow-[4px_4px_0_0_var(--shadow-ink)] px-3 py-2.5 text-[12.5px] text-[var(--text)]">
            Instagram&rsquo;s messaging window has closed for this person. They&rsquo;ll need
            to message you again before you can reply.
          </p>
        ) : (
          <form onSubmit={send} className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a reply…"
              maxLength={1000}
            />
            <Button type="submit" loading={sending} disabled={!draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  const skipped = message.status === "skipped";
  const failed = message.status === "failed";

  const sourceIcon =
    message.source === "ai" ? Bot : message.source === "human" ? UserCheck : Sparkles;
  const SourceIcon = sourceIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex", outbound ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[78%] space-y-1", outbound && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2",
            outbound
              ? skipped || failed
                ? "border-[2.5px] border-dashed border-[var(--border)] bg-transparent"
                : "rounded-tr-md bg-[linear-gradient(100deg,var(--color-kapow-500),var(--color-zap-500))] text-white"
              : "rounded-tl-md bg-[var(--bg-sunken)]",
          )}
        >
          <p className={cn("whitespace-pre-wrap text-[13px] leading-relaxed", (skipped || failed) && "text-[var(--text-muted)]")}>
            {message.text ?? `[${message.kind}]`}
          </p>
        </div>

        <div
          className={cn(
            "flex items-center gap-1.5 px-1 text-[10.5px] text-[var(--text-faint)]",
            outbound && "justify-end",
          )}
        >
          {outbound && <SourceIcon className="h-3 w-3" />}
          {outbound && (
            <span>
              {message.source === "human"
                ? "You"
                : message.source === "ai"
                  ? "AI"
                  : message.source === "broadcast"
                    ? "Broadcast"
                    : "Automation"}
            </span>
          )}
          <span>{timeAgo(message.createdAt)}</span>
          {message.humanAgentTag && <span title="Sent with the human agent tag">· human</span>}
        </div>

        {skipped && message.skipReason && (
          <p className={cn("px-1 text-[10.5px] text-[var(--color-zonk-500)]", outbound && "text-right")}>
            Not sent: {humanizeSkip(message.skipReason)}
          </p>
        )}
        {failed && message.failReason && (
          <p className={cn("px-1 text-[10.5px] text-[var(--color-zap-500)]", outbound && "text-right")}>
            Failed: {message.failReason}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function humanizeSkip(reason: string): string {
  const map: Record<string, string> = {
    WINDOW_EXPIRED: "the 24-hour messaging window had closed",
    ALREADY_REPLIED: "that comment already got its one private reply",
    COMMENT_TOO_OLD: "the comment was too old to reply to privately",
    RATE_LIMITED: "the hourly sending limit was reached",
    SUPPRESSED: "this person is suppressed",
    OPTED_OUT: "this person opted out",
    ACCOUNT_PAUSED: "automations are paused for this account",
    NOT_CONFIGURED: "Instagram isn't connected on this server",
    HUMAN_TAKEOVER: "you'd taken over this conversation",
  };
  return map[reason] ?? reason.toLowerCase().replace(/_/g, " ");
}
