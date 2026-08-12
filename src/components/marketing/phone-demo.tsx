"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCheck, Heart, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The hero centrepiece: a phone that plays the comment→DM loop, and that the
 * visitor can actually drive by typing a keyword into the comment box.
 *
 * It's a simulation, not a live API call — but it mirrors the real trigger
 * semantics exactly (keyword match, private reply, then the follow-up), so what
 * people see here is what the product does.
 */

type Scenario = {
  keyword: string;
  handle: string;
  avatar: string;
  post: string;
  comment: string;
  dm: string;
  cta: string;
  followUp: string;
  accent: string;
};

const SCENARIOS: Scenario[] = [
  {
    keyword: "RECIPE",
    handle: "maya.cooks",
    avatar: "🍜",
    post: "60-second miso ramen",
    comment: "RECIPE please!! 🤤",
    dm: "Hey Alex! Here's the full miso ramen recipe — it's the one I make every Sunday 🍜",
    cta: "Get the recipe",
    followUp: "Made it yet? Reply with a pic, I repost my favourites every Friday ✨",
    accent: "var(--color-ember-500)",
  },
  {
    keyword: "LINK",
    handle: "studio.form",
    avatar: "🪑",
    post: "The chair everyone asks about",
    comment: "LINK 🙏",
    dm: "It's the Arc lounge chair — link below, and the code ARC15 takes 15% off this week.",
    cta: "Shop the chair",
    followUp: "Heads up — the walnut finish is down to the last few.",
    accent: "var(--color-brand-500)",
  },
  {
    keyword: "GUIDE",
    handle: "leo.trains",
    avatar: "🏋️",
    post: "12-week strength plan",
    comment: "GUIDE 💪",
    dm: "Sent! The full 12-week plan is yours — start with week 1, don't skip the deloads 😉",
    cta: "Open the plan",
    followUp: "Quick one: training 3x or 4x a week? I'll tailor the next tip.",
    accent: "var(--color-flare-500)",
  },
];

type Stage = "idle" | "comment" | "matched" | "dm" | "followup";

export function PhoneDemo({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [typed, setTyped] = React.useState("");
  const [userDriven, setUserDriven] = React.useState(false);

  const scenario = SCENARIOS[index];

  // Autoplay the loop until the visitor takes over by typing.
  React.useEffect(() => {
    if (userDriven || reduceMotion) return;

    const timeline: Array<[Stage, number]> = [
      ["comment", 900],
      ["matched", 1500],
      ["dm", 2400],
      ["followup", 4200],
      ["idle", 6600],
    ];
    const timers = timeline.map(([next, delay]) => setTimeout(() => setStage(next), delay));
    const advance = setTimeout(() => setIndex((i) => (i + 1) % SCENARIOS.length), 7400);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(advance);
    };
  }, [index, userDriven, reduceMotion]);

  // Reduced motion: show the finished state rather than an empty phone.
  React.useEffect(() => {
    if (reduceMotion) setStage("followup");
  }, [reduceMotion]);

  function runUserComment(event: React.FormEvent) {
    event.preventDefault();
    const value = typed.trim();
    if (!value) return;

    setUserDriven(true);
    setStage("comment");

    const matched = SCENARIOS.findIndex((s) => value.toUpperCase().includes(s.keyword));
    if (matched >= 0) setIndex(matched);

    setTimeout(() => setStage("matched"), 700);
    setTimeout(() => setStage("dm"), 1500);
    setTimeout(() => setStage("followup"), 3400);
    setTimeout(() => {
      setUserDriven(false);
      setTyped("");
      setStage("idle");
    }, 8000);
  }

  const showDm = stage === "dm" || stage === "followup";
  const liveComment = userDriven && typed ? typed : scenario.comment;

  return (
    <div className={cn("relative", className)}>
      {/* Glow behind the device */}
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        animate={{
          backgroundColor: scenario.accent,
          opacity: showDm ? 0.3 : 0.16,
          scale: showDm ? 1.08 : 1,
        }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />

      <div className="relative mx-auto w-full max-w-[330px]">
        {/* Device frame */}
        <div className="relative rounded-[2.6rem] border border-[var(--border-strong)] bg-[var(--bg-sunken)] p-2.5 shadow-lift">
          <div className="absolute left-1/2 top-3.5 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-[var(--bg-sunken)]" />

          <div className="relative h-[600px] overflow-hidden rounded-[2.1rem] bg-[var(--bg)]">
            {/* Status bar */}
            <div className="flex items-center justify-between px-6 pb-1 pt-4 text-[11px] font-medium text-[var(--text-muted)]">
              <span>9:41</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--mint-500,#16c47f)]" />
                <span className="tracking-tight">InstaDM247</span>
              </span>
            </div>

            <AnimatePresence mode="wait">
              {showDm ? (
                <DmView key="dm" scenario={scenario} stage={stage} />
              ) : (
                <PostView
                  key="post"
                  scenario={scenario}
                  stage={stage}
                  comment={liveComment}
                />
              )}
            </AnimatePresence>

            {/* Comment composer — the visitor can drive the demo from here */}
            {!showDm && (
              <form
                onSubmit={runUserComment}
                className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-raised)] px-3 py-3"
              >
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={`Try commenting "${scenario.keyword}"…`}
                  aria-label="Try a comment"
                  className="h-9 flex-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[13px] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  aria-label="Post comment"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] transition-transform active:scale-90"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Floating trigger chip — the "why did that happen" annotation */}
        <AnimatePresence>
          {stage === "matched" && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              className="glass absolute -right-4 top-[46%] z-30 rounded-2xl px-3.5 py-2.5 shadow-lift sm:-right-16"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-[pulse-ring_1.6s_ease-out_infinite] rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[11px] font-medium">
                  Keyword <span className="text-gradient font-semibold">{scenario.keyword}</span> matched
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">
                Sending private reply · official API
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scenario switcher */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.keyword}
            onClick={() => {
              setIndex(i);
              setStage("idle");
              setUserDriven(false);
              setTyped("");
            }}
            aria-label={`Show the ${s.keyword} example`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === index ? "w-7 bg-[var(--accent)]" : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--text-faint)]",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function PostView({
  scenario,
  stage,
  comment,
}: {
  scenario: Scenario;
  stage: Stage;
  comment: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.28 }}
      className="flex h-full flex-col"
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-flare-500))] text-sm">
          {scenario.avatar}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{scenario.handle}</p>
          <p className="truncate text-[10px] text-[var(--text-faint)]">{scenario.post}</p>
        </div>
      </div>

      {/* Post artwork — a generated gradient, no external assets */}
      <div
        className="grain relative mx-4 h-[220px] overflow-hidden rounded-2xl"
        style={{
          background: `radial-gradient(120% 90% at 20% 15%, ${scenario.accent}, transparent 60%), linear-gradient(150deg, var(--color-brand-700), var(--color-ink-900))`,
        }}
      >
        <div className="absolute inset-0 grid place-items-center text-6xl opacity-90">
          {scenario.avatar}
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-3 text-[var(--text-muted)]">
        <Heart className="h-[18px] w-[18px]" />
        <MessageCircle className="h-[18px] w-[18px]" />
        <Send className="h-[18px] w-[18px]" />
      </div>

      <div className="flex-1 space-y-2.5 px-4">
        <p className="text-[11px] font-medium text-[var(--text-faint)]">Comments</p>

        <div className="flex items-start gap-2 opacity-60">
          <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--bg-sunken)] text-[10px]">
            🙂
          </div>
          <p className="text-[12px] leading-relaxed">
            <span className="font-semibold">jules.k</span> this looks unreal
          </p>
        </div>

        <AnimatePresence>
          {stage !== "idle" && (
            <motion.div
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="flex items-start gap-2"
            >
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-flare-500),var(--color-ember-500))] text-[10px]">
                ✨
              </div>
              <p className="text-[12px] leading-relaxed">
                <span className="font-semibold">alex.rivera</span>{" "}
                <span className={cn(stage === "matched" && "rounded bg-emerald-400/20 px-1")}>
                  {comment}
                </span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DmView({ scenario, stage }: { scenario: Scenario; stage: Stage }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="flex h-full flex-col"
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-flare-500))] text-sm">
          {scenario.avatar}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{scenario.handle}</p>
          <p className="text-[10px] text-emerald-400">Active now</p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[9px] text-[var(--text-faint)]">
          24h window open
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-hidden px-4 py-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="max-w-[86%] space-y-2"
        >
          <div className="rounded-2xl rounded-tl-md bg-[var(--bg-sunken)] px-3.5 py-2.5">
            <p className="text-[12.5px] leading-relaxed">{scenario.dm}</p>
          </div>

          <button
            className="w-full rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition-transform active:scale-[0.98]"
            style={{
              background: `linear-gradient(100deg, ${scenario.accent}, var(--color-brand-500))`,
            }}
          >
            {scenario.cta} →
          </button>

          <p className="flex items-center gap-1 pl-1 text-[9.5px] text-[var(--text-faint)]">
            <CheckCheck className="h-3 w-3 text-sky-400" /> Delivered · sent 1.2s after the comment
          </p>
        </motion.div>

        <AnimatePresence>
          {stage === "followup" && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.15 }}
              className="max-w-[86%] space-y-1.5"
            >
              <div className="rounded-2xl rounded-tl-md bg-[var(--bg-sunken)] px-3.5 py-2.5">
                <p className="text-[12.5px] leading-relaxed">{scenario.followUp}</p>
              </div>
              <p className="pl-1 text-[9.5px] text-[var(--text-faint)]">
                Follow-up step · sent 20 min later
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {stage === "dm" && (
          <div className="flex w-14 items-center justify-center gap-1 rounded-2xl bg-[var(--bg-sunken)] px-3 py-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-faint)]"
                style={{ animation: `typing 1.2s ease-in-out ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
