"use client";

import * as React from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { ChevronDown, Moon, Sun } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

/** Fade-and-rise on scroll into view. The workhorse of the marketing page. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Counts up when scrolled into view. */
export function Counter({
  to,
  suffix = "",
  prefix = "",
  decimals = 0,
  className,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = React.useState("0");

  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => {
        setDisplay(
          decimals > 0
            ? value.toFixed(decimals)
            : to >= 10_000
              ? formatNumber(value)
              : Math.round(value).toLocaleString(),
        );
      },
    });
    return () => controls.stop();
  }, [inView, to, decimals]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/** Card that tilts toward the cursor. Disabled on touch and coarse pointers. */
export function TiltCard({
  children,
  className,
  intensity = 8,
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), {
    stiffness: 220,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), {
    stiffness: 220,
    damping: 20,
  });

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className={cn("[transform-style:preserve-3d]", className)}
    >
      {children}
    </motion.div>
  );
}

/** Cursor-following spotlight on a card surface. */
export function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: 50, y: 50 });
  const [active, setActive] = React.useState(false);

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setPos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      className={cn("group relative overflow-hidden", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(300px circle at ${pos.x}% ${pos.y}%, color-mix(in oklab, var(--color-pow-400) 45%, transparent), transparent 68%)`,
        }}
      />
      {children}
    </div>
  );
}

/** Infinite horizontal scroller, duplicated for a seamless loop. */
export function Marquee({
  children,
  speed = 42,
  reverse = false,
  className,
}: {
  children: React.ReactNode;
  speed?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mask-fade-x overflow-hidden", className)}>
      <div
        className="flex w-max gap-4"
        style={{
          animation: `marquee ${speed}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        <div className="flex shrink-0 gap-4">{children}</div>
        <div className="flex shrink-0 gap-4" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Thin progress bar pinned to the top of the viewport. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-1 origin-left border-b-2 border-[var(--border)] bg-[linear-gradient(90deg,var(--color-zap-400),var(--color-pow-400),var(--color-bam-400))]"
    />
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<"light" | "dark">("dark");

  React.useEffect(() => {
    const stored = localStorage.getItem("idm-theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("idm-theme", next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text)] shadow-[2px_2px_0_0_var(--shadow-ink)] transition-transform duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:bg-[var(--color-pow-400)] active:translate-x-[1px] active:translate-y-[1px]",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex -rotate-1 items-center gap-2 rounded-full border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)] px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#12110e] shadow-[3px_3px_0_0_var(--shadow-ink)]">
      <span className="h-2 w-2 rounded-full border-2 border-[#12110e] bg-[var(--color-zap-400)]" />
      {children}
    </span>
  );
}

export function Accordion({
  items,
}: {
  items: Array<{ question: string; answer: React.ReactNode }>;
}) {
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <div className="divide-y-[2.5px] divide-[var(--border)] overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] shadow-[5px_5px_0_0_var(--shadow-ink)]">
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <div key={item.question}>
            <button
              onClick={() => setOpen(expanded ? null : i)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--color-pow-400)]/25"
            >
              <span className="text-[15px] font-extrabold">{item.question}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform duration-300",
                  expanded && "rotate-180",
                )}
              />
            </button>
            <motion.div
              initial={false}
              animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
              transition={{ duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 text-[14px] font-medium leading-relaxed text-[var(--text-muted)]">
                {item.answer}
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Re-exported so every existing `import { Logo } from "./bits"` picks up the
 * real brand lockup. The lockup itself lives in `@/components/brand/logo` and
 * is a server component — nothing about it needs to ship to the client.
 */
export { LogoLink as Logo } from "@/components/brand/logo";
