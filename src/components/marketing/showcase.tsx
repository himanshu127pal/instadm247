"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AtSign,
  Bot,
  CircleDot,
  Clock,
  GitBranch,
  MessageSquare,
  MessagesSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Interactive trigger showcase
   ========================================================================== */

const TRIGGERS = [
  {
    id: "comment",
    icon: MessageSquare,
    name: "Comment on a post or Reel",
    tagline: "The one everyone starts with",
    detail:
      "Someone comments your keyword — or anything at all — and they get a DM seconds later. Reply publicly in the thread too, so the comment section still looks alive.",
    example: { from: "alex.rivera", text: "LINK 🙌", reply: "Sent it to your DMs! 💌" },
    stat: "Fires in ~1.2s",
  },
  {
    id: "story_reply",
    icon: MessagesSquare,
    name: "Story reply",
    tagline: "Catch the warmest audience you have",
    detail:
      "Anyone replying to your story gets an instant answer. Match on keywords, or respond to every single reply so nobody sits unanswered overnight.",
    example: { from: "sam.j", text: "where's this from?", reply: "It's the Arc lounge — here 👇" },
    stat: "Keyword or catch-all",
  },
  {
    id: "story_mention",
    icon: AtSign,
    name: "Story @mention",
    tagline: "Giveaways run themselves",
    detail:
      '"Share this and tag me to enter" — every person who mentions you gets their entry confirmation and your link, automatically, without you refreshing anything.',
    example: { from: "nina.co", text: "mentioned you", reply: "You're entered! 🎉 Here's your bonus:" },
    stat: "Perfect for giveaways",
  },
  {
    id: "live",
    icon: Radio,
    name: "Instagram Live comment",
    tagline: "Convert while you're still on camera",
    detail:
      "Drop a keyword mid-broadcast and viewers get the link before they scroll away. Built to absorb the comment burst a Live produces without dropping anyone.",
    example: { from: "viewer_88", text: "DROP", reply: "Here's the code, live only 🔥" },
    stat: "Handles Live bursts",
  },
  {
    id: "dm",
    icon: MessagesSquare,
    name: "DM keyword",
    tagline: "Your inbox answers itself",
    detail:
      "Someone messages you 'price', 'shipping' or 'book' and gets the right answer instantly — or an AI reply grounded in your own knowledge base.",
    example: { from: "jordan", text: "do you ship to the UK?", reply: "We do! 3–5 days, free over £60." },
    stat: "AI-assisted",
  },
  {
    id: "ads",
    icon: Zap,
    name: "Ads & boosted posts",
    tagline: "Turn paid reach into conversations",
    detail:
      "Comments on boosted posts and ads fire the same automations, with the ad's name attached — so you can see exactly which creative earned the conversation.",
    example: { from: "casey.m", text: "INFO", reply: "Here's everything about the launch →" },
    stat: "Attributed by ad",
  },
] as const;

export function TriggerShowcase() {
  const [active, setActive] = React.useState(0);
  const trigger = TRIGGERS[active];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0 no-scrollbar">
        {TRIGGERS.map((item, i) => {
          const Icon = item.icon;
          const isActive = i === active;
          return (
            <button
              key={item.id}
              onClick={() => setActive(i)}
              className={cn(
                "group relative flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 lg:w-full",
                "border-[2.5px] border-[var(--border)]",
                isActive
                  ? "bg-[var(--color-pow-400)] text-[#12110e] shadow-[4px_4px_0_0_var(--shadow-ink)]"
                  : "bg-[var(--bg-raised)] shadow-[2px_2px_0_0_var(--shadow-ink)] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[4px_4px_0_0_var(--shadow-ink)]",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="trigger-active"
                  className="absolute inset-0 -z-10 rounded-2xl"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-[var(--border)] transition-colors",
                  isActive
                    ? "bg-[var(--color-zap-400)] text-white"
                    : "bg-[var(--bg-sunken)] text-[var(--text)]",
                )}
              >
                <Icon className="h-[17px] w-[17px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-extrabold">{item.name}</span>
                <span className="block truncate text-[11.5px] font-semibold opacity-70">
                  {item.tagline}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border-[3px] border-[var(--border)] bg-[var(--bg-raised)] p-6 shadow-[6px_6px_0_0_var(--shadow-ink)] sm:p-8">
        <div aria-hidden className="halftone pointer-events-none absolute inset-0 opacity-40" />
        <AnimatePresence mode="wait">
          <motion.div
            key={trigger.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative space-y-5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-[26px] tracking-wide">{trigger.name}</h3>
              <span className="rounded-full border-2 border-[var(--border)] bg-[var(--color-bam-400)] px-2.5 py-0.5 text-[11px] font-extrabold uppercase text-[#12110e]">
                {trigger.stat}
              </span>
            </div>

            <p className="max-w-xl text-[15px] font-semibold leading-relaxed text-[var(--text-muted)]">
              {trigger.detail}
            </p>

            {/* Mini conversation */}
            <div className="space-y-2.5 rounded-2xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-4">
              <div className="flex items-start gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--border)] bg-[var(--color-pow-400)] text-[11px] font-extrabold text-[#12110e]">
                  {trigger.example.from[0].toUpperCase()}
                </span>
                <div className="rounded-2xl rounded-tl-md border-2 border-[var(--border)] bg-[var(--bg-raised)] px-3.5 py-2">
                  <p className="text-[10px] text-[var(--text-faint)]">@{trigger.example.from}</p>
                  <p className="text-[13px]">{trigger.example.text}</p>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25, type: "spring", stiffness: 280, damping: 24 }}
                className="flex justify-end"
              >
                <div className="max-w-[80%] rounded-2xl rounded-tr-md border-2 border-[var(--border)] bg-[var(--color-kapow-400)] px-3.5 py-2 text-white shadow-[3px_3px_0_0_var(--shadow-ink)]">
                  <p className="text-[13px]">{trigger.example.reply}</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ==========================================================================
   Self-building flow preview
   ========================================================================== */

const FLOW_STEPS = [
  { icon: CircleDot, label: "Comment says “GUIDE”", tone: "trigger" },
  { icon: MessageSquare, label: "Send the guide + button", tone: "action" },
  { icon: UserPlus, label: "Following you?", tone: "branch" },
  { icon: Clock, label: "Wait 20 minutes", tone: "wait" },
  { icon: Bot, label: "AI answers their question", tone: "ai" },
] as const;

const TONE_STYLES: Record<string, string> = {
  trigger: "bg-[var(--color-boom-400)] !text-[#12110e]",
  action: "bg-[var(--color-kapow-400)]",
  branch: "bg-[var(--color-pow-400)] !text-[#12110e]",
  wait: "bg-[var(--color-bam-400)] !text-[#12110e]",
  ai: "bg-[var(--color-zonk-400)] !text-[#12110e]",
};

export function FlowPreview() {
  const [built, setBuilt] = React.useState(0);

  React.useEffect(() => {
    if (built >= FLOW_STEPS.length) {
      const reset = setTimeout(() => setBuilt(0), 3200);
      return () => clearTimeout(reset);
    }
    const timer = setTimeout(() => setBuilt((n) => n + 1), built === 0 ? 500 : 850);
    return () => clearTimeout(timer);
  }, [built]);

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border-[3px] border-[var(--border)] bg-[var(--bg-sunken)] p-6 shadow-[6px_6px_0_0_var(--shadow-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border-strong) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative space-y-0">
        {FLOW_STEPS.map((step, i) => {
          const Icon = step.icon;
          const visible = i < built;
          return (
            <div key={step.label}>
              {i > 0 && (
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: visible ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="ml-[23px] h-6 w-[3px] origin-top bg-[var(--border)]"
                />
              )}
              <motion.div
                initial={{ opacity: 0, x: -18, scale: 0.96 }}
                animate={
                  visible
                    ? { opacity: 1, x: 0, scale: 1 }
                    : { opacity: 0, x: -18, scale: 0.96 }
                }
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="flex items-center gap-3 rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-2.5 pr-4 shadow-[3px_3px_0_0_var(--shadow-ink)]"
              >
                <span
                  className={cn(
                    "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border-2 border-[var(--border)] text-white",
                    TONE_STYLES[step.tone],
                  )}
                >
                  <Icon className="h-[15px] w-[15px]" />
                </span>
                <span className="text-[13px] font-extrabold">{step.label}</span>
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-5 flex items-center gap-2 text-[11.5px] font-bold text-[var(--text-muted)]">
        <GitBranch className="h-3.5 w-3.5" />
        Drag, drop, done — no code, no flowchart degree.
      </div>
    </div>
  );
}

/* ==========================================================================
   Safety guard panel
   ========================================================================== */

const GUARDS = [
  {
    title: "24-hour window, respected",
    body: "Instagram only lets you message someone within 24 hours of them contacting you. We track that window per person and simply don't send when it's closed — instead of getting your account flagged trying.",
  },
  {
    title: "One private reply per comment",
    body: "Meta allows exactly one. We claim each comment atomically, so even when Instagram sends us a duplicate webhook — which it does on boosted posts — nobody ever gets DMed twice.",
  },
  {
    title: "Rate limits with headroom",
    body: "We pace sends well under Meta's published ceilings, per account. When Instagram pushes back, Slow Down mode halves throughput for two hours automatically.",
  },
  {
    title: "The HUMAN_AGENT tag, used honestly",
    body: "That tag extends your reply window to 7 days — for messages a human actually typed. Meta detects abuse of it. We attach it only when you reply yourself from the inbox. Never on automation.",
  },
  {
    title: "Opt-outs that actually work",
    body: "Anyone replying STOP is suppressed instantly, across every automation, forever. Good for them, good for your account health.",
  },
  {
    title: "Official endpoints only",
    body: "No scraping, no session cookies, no unofficial APIs, no follow/unfollow tricks. Every action maps to a documented Instagram Graph API call.",
  },
];

export function SafetyGuards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {GUARDS.map((guard, i) => (
        <motion.div
          key={guard.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: i * 0.06 }}
          className="group relative overflow-hidden rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)] transition-transform duration-200 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[7px_7px_0_0_var(--shadow-ink)]"
        >
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border-2 border-[var(--border)] bg-[var(--color-boom-400)] text-[#12110e]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h4 className="text-[14.5px] font-extrabold">{guard.title}</h4>
          </div>
          <p className="text-[13.5px] font-medium leading-relaxed text-[var(--text-muted)]">{guard.body}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ==========================================================================
   Comparison table
   ========================================================================== */

const COMPARISON = [
  { feature: "Comment-to-DM with keyword triggers", us: true, linkdm: true, senddm: true },
  { feature: "Story replies & @mentions", us: true, linkdm: true, senddm: true },
  { feature: "Instagram Live comment automation", us: true, linkdm: "Pro", senddm: true },
  { feature: "Multi-step flows with delays & branching", us: true, linkdm: "Pro", senddm: "Limited" },
  { feature: "Visual drag-and-drop flow builder", us: true, linkdm: false, senddm: false },
  { feature: "Follower-growth gate (skip existing followers)", us: true, linkdm: "Pro", senddm: true },
  { feature: "Multi-slide carousel DMs", us: "10 slides", linkdm: "10 slides", senddm: false },
  { feature: "Lead forms, surveys & quizzes in DM", us: true, linkdm: false, senddm: true },
  { feature: "AI replies grounded in your knowledge base", us: true, linkdm: false, senddm: "Basic" },
  { feature: "DM Planner (schedule before you post)", us: true, linkdm: "Pro", senddm: false },
  { feature: "Broadcasts & smart re-engagement", us: true, linkdm: "Pro", senddm: true },
  { feature: "Unified live-chat inbox", us: true, linkdm: false, senddm: false },
  { feature: "Funnel analytics per flow step", us: true, linkdm: "Basic", senddm: "Basic" },
  { feature: "Safety Center showing every skipped send", us: true, linkdm: false, senddm: false },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true)
    return (
      <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-[var(--color-boom-400)]/15 text-emerald-400">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-label="Yes">
          <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (value === false)
    return (
      <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--border-soft)] bg-[var(--bg-sunken)] text-[var(--text-faint)]">
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-label="No">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  return (
    <span className="text-[11.5px] font-medium text-[var(--text-muted)]">{value}</span>
  );
}

export function ComparisonTable() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border-[3px] border-[var(--border)] bg-[var(--bg-raised)] shadow-[6px_6px_0_0_var(--shadow-ink)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr className="border-b-[2.5px] border-[var(--border)] bg-[var(--bg-sunken)]">
              <th className="px-5 py-4 text-[12px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
                Feature
              </th>
              <th className="px-3 py-4 text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--border)] bg-[var(--color-zap-400)] px-3 py-1 text-[12px] font-extrabold uppercase text-white shadow-[2px_2px_0_0_var(--shadow-ink)]">
                  <Sparkles className="h-3 w-3" /> InstaDM247
                </span>
              </th>
              <th className="px-3 py-4 text-center text-[12px] font-medium text-[var(--text-muted)]">
                LinkDM
              </th>
              <th className="px-3 py-4 text-center text-[12px] font-medium text-[var(--text-muted)]">
                SendDM
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row, i) => (
              <tr
                key={row.feature}
                className={cn(
                  "border-b-2 border-[var(--border-soft)] last:border-0 transition-colors hover:bg-[var(--color-pow-400)]/25",
                )}
              >
                <td className="px-5 py-3 text-[13.5px] font-semibold">{row.feature}</td>
                <td className="px-3 py-3 text-center">
                  <Cell value={row.us} />
                </td>
                <td className="px-3 py-3 text-center">
                  <Cell value={row.linkdm} />
                </td>
                <td className="px-3 py-3 text-center">
                  <Cell value={row.senddm} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t-[2.5px] border-[var(--border)] bg-[var(--bg-sunken)] px-5 py-3 text-[11.5px] font-medium text-[var(--text-muted)]">
        Competitor capabilities compiled from their public product and help pages, August 2026.
        Plans and features change — check their sites for the current picture.
      </p>
    </div>
  );
}
