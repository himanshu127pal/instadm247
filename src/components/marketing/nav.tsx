"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from "motion/react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui";
import { Logo, ThemeToggle } from "./bits";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Safety", href: "/#safety" },
];

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
        <Logo />

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
