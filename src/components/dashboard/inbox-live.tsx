"use client";

import * as React from "react";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Keeps the Inbox live and tells the person when someone new writes in.
 *
 * Polls for conversations changed since the last look — every 10 seconds while
 * the tab is visible, every 30 while it's in the background (slow enough to be
 * cheap, fast enough for a desktop alert to matter). An alert means a
 * conversation's unread count went up: that only happens on an inbound
 * message, so our own automations never set it off.
 */

const VISIBLE_MS = 10_000;
const HIDDEN_MS = 30_000;

export type LiveConversation = {
  id: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  contact: { username: string | null; igsid: string };
};

export function useInboxLive<C extends LiveConversation>(opts: {
  loadedAt: string;
  setConversations: React.Dispatch<React.SetStateAction<C[]>>;
  onIncoming: (conversation: C) => void;
}) {
  const { loadedAt, setConversations, onIncoming } = opts;
  const cursor = React.useRef(loadedAt);
  const incoming = React.useRef(onIncoming);
  incoming.current = onIncoming;

  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/conversations?since=${encodeURIComponent(cursor.current)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { conversations: C[]; now: string };
          cursor.current = data.now;
          if (data.conversations.length > 0) {
            // Keyed by id: React may run the updater twice in development.
            const alerts = new Map<string, C>();
            setConversations((current) => {
              const byId = new Map(current.map((c) => [c.id, c]));
              for (const fresh of data.conversations) {
                const before = byId.get(fresh.id);
                if (fresh.unreadCount > (before?.unreadCount ?? 0)) alerts.set(fresh.id, fresh);
                byId.set(fresh.id, fresh);
              }
              return [...byId.values()].sort(
                (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
              );
            });
            // After the state update, outside the updater: it may run twice.
            queueMicrotask(() => alerts.forEach((c) => incoming.current(c)));
          }
        }
      } catch {
        // Offline or a deploy restarting: try again on the next tick.
      }
      if (!stopped) timer = setTimeout(tick, document.hidden ? HIDDEN_MS : VISIBLE_MS);
    };

    timer = setTimeout(tick, VISIBLE_MS);
    const wake = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [setConversations]);
}

// --- Preferences ------------------------------------------------------------

const KEY = "idm-inbox-alerts";

type Prefs = { sound: boolean; desktop: boolean };

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { sound: true, desktop: false, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    // Private mode or blocked storage: defaults.
  }
  return { sound: true, desktop: false };
}

export function useAlertPrefs() {
  const [prefs, setPrefs] = React.useState<Prefs>({ sound: true, desktop: false });
  React.useEffect(() => setPrefs(readPrefs()), []);
  const update = (next: Partial<Prefs>) =>
    setPrefs((current) => {
      const merged = { ...current, ...next };
      try {
        localStorage.setItem(KEY, JSON.stringify(merged));
      } catch {
        // Not saved; still applies for this visit.
      }
      return merged;
    });
  return [prefs, update] as const;
}

// --- Alerts -----------------------------------------------------------------

let audio: AudioContext | null = null;

/** A short two-note chime, synthesised — no audio file to ship or cache. */
export function playChime() {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // No audio (or blocked until the page has been clicked): stay silent.
  }
}

export function showDesktopAlert(conversation: LiveConversation, onClick: () => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const who = conversation.contact.username ? `@${conversation.contact.username}` : "Someone";
  const note = new Notification(`${who} sent you a message`, {
    body: conversation.lastMessagePreview ?? "",
    tag: conversation.id, // one notification per thread, replaced rather than stacked
    icon: "/icon.png",
  });
  note.onclick = () => {
    window.focus();
    onClick();
    note.close();
  };
}

export function AlertToggles({
  prefs,
  update,
}: {
  prefs: Prefs;
  update: (next: Partial<Prefs>) => void;
}) {
  // Read after mount: the server has no Notification API, and deciding during
  // render would give the server and the browser different markup.
  const [support, setSupport] = React.useState<{ supported: boolean; denied: boolean }>({
    supported: false,
    denied: false,
  });
  React.useEffect(() => {
    const supported = typeof Notification !== "undefined";
    setSupport({ supported, denied: supported && Notification.permission === "denied" });
  }, [prefs.desktop]);
  const { supported, denied } = support;

  async function toggleDesktop() {
    if (prefs.desktop) return update({ desktop: false });
    if (!supported) return;
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    update({ desktop: permission === "granted" });
  }

  const chip =
    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] transition-colors hover:bg-[var(--bg-subtle)]";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          update({ sound: !prefs.sound });
          if (!prefs.sound) playChime(); // a preview, and it unlocks audio for later
        }}
        className={cn(chip, prefs.sound ? "text-[var(--accent)]" : "text-[var(--text-faint)]")}
        aria-pressed={prefs.sound}
        title={prefs.sound ? "Sound on for new messages" : "Sound off"}
      >
        {prefs.sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        Sound
      </button>
      {supported && (
        <button
          type="button"
          onClick={() => void toggleDesktop()}
          disabled={denied}
          className={cn(chip, prefs.desktop ? "text-[var(--accent)]" : "text-[var(--text-faint)]", denied && "opacity-50")}
          aria-pressed={prefs.desktop}
          title={
            denied
              ? "Notifications are blocked for this site in your browser settings"
              : prefs.desktop
                ? "Desktop alerts on while this tab is in the background"
                : "Get a desktop alert when this tab is in the background"
          }
        >
          {prefs.desktop ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          Desktop
        </button>
      )}
    </div>
  );
}
