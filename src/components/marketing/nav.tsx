"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from "motion/react";
import { ArrowRight, BadgeCheck, BookOpen, ChevronDown, LifeBuoy, Lightbulb, Menu, Newspaper, Scale, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui";
import { Logo, ThemeToggle } from "./bits";
import { cn } from "@/lib/utils";
import { MetaBadge } from "./meta-badge";

const LINKS = [
  { label: "Features", href: "/features" },
  { label: "Safety", href: "/features/account-safety" },
];

/** The Resources menu: what to read, and where to get help. */
const RESOURCES = [
  {
    title: "Learn and grow",
    items: [
      { label: "Docs", hint: "Setup and product guidance", href: "/docs", icon: BookOpen },
      { label: "Blog", hint: "Instagram's rules and how-tos", href: "/blog", icon: Newspaper },
      { label: "Compare", hint: "How we stack up", href: "/compare", icon: Scale },
    ],
  },
  {
    title: "Product help",
    items: [
      { label: "Support", hint: "Get help from our team", href: "/dashboard/support", icon: LifeBuoy },
      { label: "Request a feature", hint: "Tell us what to build next", href: "/dashboard/requests", icon: Lightbulb },
      { label: "Account safety", hint: "How we keep your account safe", href: "/features/account-safety", icon: ShieldCheck },
      { label: "Meta Tech Provider", hint: "What it means for your account", href: "/meta-tech-provider", icon: BadgeCheck },
    ],
  },
];

function ResourcesMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-[13.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
      >
        Resources <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            className="absolute left-1/2 top-full z-50 w-[560px] -translate-x-1/2 pt-2"
          >
            <div className="rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-4 shadow-[5px_5px_0_0_var(--shadow-ink)]">
              <div className="grid grid-cols-2 gap-4">
                {RESOURCES.map((group) => (
                  <div key={group.title}>
                    <p className="px-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent)]">{group.title}</p>
                    <ul className="mt-2 space-y-0.5">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--bg-subtle)]"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-[var(--border)] text-[var(--accent)]">
                              <item.icon className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block text-[14px] font-bold">{item.label}</span>
                              <span className="block text-[12px] text-[var(--text-muted)]">{item.hint}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Link
                href="/docs"
                onClick={() => setOpen(false)}
                className="mt-3 flex items-center justify-between rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)] px-4 py-3 text-[#12110e]"
              >
                <span>
                  <span className="block text-[14px] font-extrabold">Explore the docs</span>
                  <span className="block text-[12px]">Every feature, step by step, kept in step with the app</span>
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MarketingNav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 24));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled ? "glass border-b border-[var(--border)]" : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          {/* Always visible, on every screen size: what our access to Instagram is. */}
          <MetaBadge className="hidden sm:inline-flex" />
        </div>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-[13.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
            >
              {link.label}
            </Link>
          ))}
          <ResourcesMenu />
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="gradient" size="sm">
              Start free
            </Button>
          </Link>
        </div>

        <MetaBadge className="sm:hidden" />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="overflow-hidden border-t border-[var(--border)] bg-[var(--bg-raised)] md:hidden"
          >
            <div className="space-y-1 px-5 py-4">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-[14px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                >
                  {link.label}
                </Link>
              ))}
              {RESOURCES.map((group) => (
                <div key={group.title} className="pt-2">
                  <p className="px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">{group.title}</p>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-2 text-[14px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="flex items-center gap-2 pt-3">
                <Link href="/login" className="flex-1" onClick={() => setOpen(false)}>
                  <Button variant="secondary" className="w-full">
                    Sign in
                  </Button>
                </Link>
                <Link href="/signup" className="flex-1" onClick={() => setOpen(false)}>
                  <Button variant="gradient" className="w-full">
                    Start free
                  </Button>
                </Link>
              </div>
              <div className="pt-2">
                <ThemeToggle />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
