"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, Check, Compass, X } from "lucide-react";
import type { ChecklistStep } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const save = (body: Record<string, string>) =>
  fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);

/** The getting-started bar: progress, the next step, and the rest on demand. */
export function GettingStarted({ steps, onTour }: { steps: ChecklistStep[]; onTour: () => void }) {
  const router = useRouter();
  const [hidden, setHidden] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (hidden || !next) return null;

  async function resend() {
    const res = await fetch("/api/auth/verify/resend", { method: "POST" }).catch(() => null);
    if (res?.ok) toast.success("Sent. Check your inbox for the link.");
    else toast.error("Couldn't send it just now. Try again in a minute.");
  }

  return (
    <div data-tour="getting-started" className="mx-5 mt-4 rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] px-4 py-3 shadow-[3px_3px_0_0_var(--shadow-ink)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[180px]">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent)]">Getting started</p>
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-left text-[13.5px] font-extrabold hover:underline" aria-expanded={open}>
            Finish setting up your workspace
          </button>
        </div>
        <div className="flex min-w-[140px] flex-1 items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--bg-sunken)]">
            <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <span className="text-[12px] font-extrabold tabular-nums text-[var(--accent)]">
            {done}/{steps.length}
          </span>
        </div>
        {next.key === "verify" ? (
          <button type="button" onClick={resend} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-[12.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/20">
            Next: resend the confirmation email <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Link href={next.href} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-[12.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/20">
            Next: {next.cta} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        <button
          type="button"
          aria-label="Hide getting started"
          onClick={() => {
            setHidden(true);
            void save({ checklist: "dismiss" }).then(() => router.refresh());
          }}
          className="rounded-lg p-1 text-[var(--text-faint)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.key}>
                  <Link
                    href={s.href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 text-[12.5px] font-semibold",
                      s.done ? "border-transparent text-[var(--text-faint)] line-through" : "border-[var(--border)] hover:bg-[var(--bg-sunken)]",
                    )}
                  >
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[10.5px]", s.done ? "border-[var(--color-boom-500)] bg-[var(--color-boom-400)] text-[#12110e]" : "border-[var(--border)]")}>
                      {s.done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ol>
            <button type="button" onClick={onTour} className="mt-2.5 flex items-center gap-1.5 text-[12px] font-bold text-[var(--accent)] hover:underline">
              <Compass className="h-3.5 w-3.5" /> Take the tour again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type TourStep = { target?: string; title: string; body: string };

/** Where things are, in the order someone new needs them. Targets are `data-tour` attributes. */
export const TOUR: TourStep[] = [
  { title: "Welcome to InstaDM247 👋", body: "A quick tour of where everything is. It takes about 30 seconds, and you can skip it any time." },
  { target: "/dashboard/automations", title: "Automations", body: "Each one listens for a comment, story reply or DM and runs a flow for the person. This is where you'll spend most of your time." },
  { target: "/dashboard/content", title: "My content", body: "Your posts, Reels and live stories, and which automation answers on each. Start a new automation for a post from here." },
  { target: "/dashboard/inbox", title: "Inbox", body: "Every conversation, updating live. Jump in and reply yourself whenever you like." },
  { target: "/dashboard/contacts", title: "Contacts", body: "Everyone who's interacted, with tags and follower status. Tag people here or with a Tag step." },
  { target: "/dashboard/analytics", title: "Analytics", body: "What triggered, what was sent, what was opened and what got tapped, per automation." },
  { target: "ask-ai", title: "Ask AI", body: "Stuck? Ask how to do anything. The AI Helper knows every page, and can draft an automation for you." },
  { target: "/dashboard/support", title: "Help", body: "Open a support ticket or request a feature. We read every one." },
  { target: "getting-started", title: "Your next steps", body: "Follow this checklist to go live. Each step ticks itself off as you do it." },
];

/** The first-run tour: a spotlight on each place, and a card saying what it's for. */
export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  React.useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Steps whose place isn't on screen (a small screen hides the sidebar) are
  // shown as a centred card, without a spotlight.
  const step = TOUR[index];
  React.useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(step.target)}"]`) : null;
      const r = el?.getBoundingClientRect();
      const visible = r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
      if (el && visible) el.scrollIntoView({ block: "nearest" });
      setRect(visible ? el!.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, step]);

  React.useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function finish() {
    void save({ tour: "done" });
    onClose();
  }
  function next() {
    if (index === TOUR.length - 1) finish();
    else setIndex((i) => i + 1);
  }

  if (!open) return null;
  const pad = 6;
  // Beside the spotlight when there's room on the right (the sidebar), else below it.
  const card = rect
    ? rect.right + 340 < window.innerWidth
      ? { left: rect.right + 16, top: Math.max(16, Math.min(rect.top - 8, window.innerHeight - 230)) }
      : { left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)), top: Math.min(rect.bottom + 14, window.innerHeight - 230) }
    : null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Tour">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-4 ring-[var(--color-pow-400)] transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(10,10,8,0.6)" }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[rgba(10,10,8,0.6)]" />
      )}
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "absolute w-[320px] max-w-[calc(100vw-32px)] rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-4 shadow-[5px_5px_0_0_var(--shadow-ink)]",
          !card && "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
        style={card ?? undefined}
      >
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent)]">
          {index + 1} of {TOUR.length}
        </p>
        <h2 className="mt-1 text-[16px] font-extrabold">{step.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-[12.5px] font-semibold text-[var(--text-faint)] hover:text-[var(--text)]">
            Skip tour
          </button>
          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <button type="button" onClick={() => setIndex((i) => i - 1)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold hover:bg-[var(--bg-sunken)]">
                Back
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={next}
              className="rounded-lg border-2 border-[var(--border)] bg-[var(--color-pow-400)] px-3.5 py-1.5 text-[12.5px] font-extrabold text-[#12110e] shadow-[2px_2px_0_0_var(--shadow-ink)]"
            >
              {index === TOUR.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
