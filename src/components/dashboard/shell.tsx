"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  AlertTriangle,
  BarChart3,
  Compass,
  LifeBuoy,
  Lightbulb,
  Images,
  Bot,
  ChevronDown,
  ClipboardList,
  Code2,
  CalendarClock,
  CreditCard,
  Gauge,
  Inbox,
  Link2,
  Aperture,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { GettingStarted, Tour } from "@/components/dashboard/onboarding";
import type { Onboarding } from "@/lib/onboarding";
import { Logo, ThemeToggle } from "@/components/marketing/bits";
import { cn, initials } from "@/lib/utils";

type Account = {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  status: string;
  automationPaused: boolean;
  slowDownUntil: Date | null;
};

const NAV = [
  { section: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: Gauge }] },
  {
    section: "Engage",
    items: [
      { href: "/dashboard/automations", label: "Automations", icon: Workflow },
      { href: "/dashboard/content", label: "My content", icon: Images },
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
      { href: "/dashboard/broadcasts", label: "Broadcasts", icon: Megaphone },
      { href: "/dashboard/planner", label: "DM Planner", icon: ClipboardList },
      { href: "/dashboard/scheduler", label: "Scheduler", icon: CalendarClock },
    ],
  },
  {
    section: "Audience",
    items: [
      { href: "/dashboard/contacts", label: "Contacts", icon: Users },
      { href: "/dashboard/forms", label: "Lead forms", icon: ClipboardList },
      { href: "/dashboard/bio", label: "Link in bio", icon: Link2 },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/ai", label: "AI agent", icon: Bot },
      { href: "/dashboard/helper", label: "AI Helper", icon: Sparkles },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/dashboard/accounts", label: "Instagram accounts", icon: Aperture },
      { href: "/dashboard/safety", label: "Safety Center", icon: ShieldCheck },
      { href: "/dashboard/templates", label: "Templates", icon: MessagesSquare },
      { href: "/dashboard/developers", label: "Developers", icon: Code2 },
      { href: "/dashboard/billing", label: "Plan & billing", icon: CreditCard, billingOnly: true },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    section: "Help",
    items: [
      { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
      { href: "/dashboard/requests", label: "Request a feature", icon: Lightbulb },
      { href: "/dashboard?tour=1", label: "Take the tour", icon: Compass },
    ],
  },
];

export function DashboardShell({
  user,
  workspace,
  accounts,
  instagramConfigured,
  showBilling = false,
  onboarding,
  children,
}: {
  user: { id: string; email: string; name: string | null };
  workspace: { id: string; name: string; planKey: string };
  accounts: Account[];
  instagramConfigured: boolean;
  /** False while billing is off — there is nothing to buy, so no page offering it. */
  showBilling?: boolean;
  /** Absent in a support session: staff looking in get no checklist or tour. */
  onboarding?: Onboarding;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [tourOpen, setTourOpen] = React.useState(false);
  // The layout (and so `onboarding`) isn't re-read when moving between pages,
  // so after a skip it would still say "show the tour". Start it at most once.
  const tourStarted = React.useRef(false);

  // New here: the tour starts on its own once. "Take the tour" (?tour=1) brings it back.
  React.useEffect(() => {
    if (!onboarding) return;
    if (new URLSearchParams(window.location.search).get("tour") === "1") {
      tourStarted.current = true;
      setTourOpen(true);
      router.replace(pathname);
    } else if (onboarding.showTour && !tourStarted.current && window.innerWidth >= 1024) {
      tourStarted.current = true;
      setTourOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const warnings = React.useMemo(() => {
    const list: Array<{ tone: "warning" | "danger"; message: string; href: string }> = [];

    if (!instagramConfigured) {
      list.push({
        tone: "warning",
        message:
          "Connecting Instagram is temporarily unavailable on our side. You can build and edit everything; live sending is off until it clears.",
        href: "/dashboard/accounts",
      });
    }
    for (const account of accounts) {
      if (account.status === "token_expired" || account.status === "revoked") {
        list.push({
          tone: "danger",
          message: `@${account.username} needs reconnecting. Automations are paused for it.`,
          href: "/dashboard/accounts",
        });
      } else if (account.automationPaused) {
        list.push({
          tone: "warning",
          message: `Automations are paused for @${account.username}.`,
          href: "/dashboard/safety",
        });
      } else if (account.slowDownUntil && new Date(account.slowDownUntil) > new Date()) {
        list.push({
          tone: "warning",
          message: `Slow Down mode is active for @${account.username} to protect the account.`,
          href: "/dashboard/safety",
        });
      }
    }
    return list;
  }, [accounts, instagramConfigured]);

  return (
    <div className="flex min-h-screen bg-[var(--bg-subtle)]">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r-[3px] border-[var(--border)] bg-[var(--bg-raised)] transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b-[3px] border-[var(--border)] px-5">
          <Logo href="/dashboard" />
          <button
            onClick={() => setMobileOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.section}>
              <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                {group.section}
              </p>
              <div className="space-y-0.5">
                {group.items
                  .filter((item) => !("billingOnly" in item && item.billingOnly) || showBilling)
                  .map((item) => {
                  const Icon = item.icon;
                  if (item.href === "/dashboard?tour=1") {
                    // A button, not a link: it has to work from any page, the dashboard included.
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          setMobileOpen(false);
                          setTourOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-bold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
                      >
                        <Icon className="h-[16px] w-[16px]" />
                        {item.label}
                      </button>
                    );
                  }
                  const active =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-tour={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-bold transition-colors",
                        active
                          ? "text-[#12110e]"
                          : "text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 -z-10 rounded-xl border-2 border-[var(--border)] bg-[var(--color-pow-400)] shadow-[2px_2px_0_0_var(--shadow-ink)]"
                          transition={{ type: "spring", stiffness: 400, damping: 34 }}
                        />
                      )}
                      <Icon
                        className={cn("h-[16px] w-[16px]", active && "text-[#12110e]")}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <AccountSwitcher accounts={accounts} />
        <UserMenu user={user} workspace={workspace} />
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b-[3px] border-[var(--border)] bg-[var(--bg-raised)]/90 px-5 backdrop-blur-xl">
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-xl border-[2.5px] border-[var(--border)] shadow-[2px_2px_0_0_var(--shadow-ink)] lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex-1" />

          {!pathname.startsWith("/dashboard/helper") && (
            <Link
              href={`/dashboard/helper?from=${encodeURIComponent(pathname)}`}
              data-tour="ask-ai"
              className="flex items-center gap-1.5 rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)] px-3 py-1.5 text-[12.5px] font-extrabold text-[#12110e] shadow-[2px_2px_0_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ask AI</span>
            </Link>
          )}

          <Badge tone={accounts.length ? "success" : "neutral"}>
            {accounts.length
              ? `${accounts.length} account${accounts.length > 1 ? "s" : ""} connected`
              : "No account connected"}
          </Badge>
          <ThemeToggle />
        </header>

        {warnings.length > 0 && (
          <div className="space-y-2 px-5 pt-4">
            {warnings.map((warning, i) => (
              <Link
                key={i}
                href={warning.href}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border-[2.5px] border-[var(--border)] px-4 py-2.5 text-[13px] font-bold text-[#12110e] shadow-[3px_3px_0_0_var(--shadow-ink)] transition-transform hover:-translate-y-[1px]",
                  warning.tone === "danger"
                    ? "bg-[var(--color-zap-400)] text-white"
                    : "bg-[var(--color-pow-400)]",
                )}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning.message}</span>
              </Link>
            ))}
          </div>
        )}

        {onboarding?.showChecklist && <GettingStarted steps={onboarding.steps} onTour={() => setTourOpen(true)} />}

        <main className="flex-1 p-5">{children}</main>
        <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      </div>
    </div>
  );
}

function AccountSwitcher({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return (
      <div className="border-t-[3px] border-[var(--border)] p-3">
        <Link
          href="/dashboard/accounts"
          className="flex items-center gap-2.5 rounded-xl border-[2.5px] border-dashed border-[var(--border)] px-3 py-2.5 text-[13px] font-bold text-[var(--text-muted)] transition-colors hover:bg-[var(--color-pow-400)] hover:text-[#12110e]"
        >
          <Aperture className="h-4 w-4" />
          Connect Instagram
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t-[3px] border-[var(--border)] p-3">
      <p className="mb-1.5 px-1 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">
        Accounts
      </p>
      <div className="space-y-0.5">
        {accounts.slice(0, 4).map((account) => (
          <Link
            key={account.id}
            href={`/dashboard/accounts#${account.id}`}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <span className="relative">
              {account.profilePictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.profilePictureUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--border)] bg-[var(--color-kapow-400)] text-[10px] font-extrabold text-white">
                  {initials(account.username)}
                </span>
              )}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--bg)]",
                  account.status === "connected" && !account.automationPaused
                    ? "bg-[var(--color-boom-400)]"
                    : "bg-[var(--color-pow-400)]",
                )}
              />
            </span>
            <span className="truncate text-[var(--text-muted)]">@{account.username}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function UserMenu({
  user,
  workspace,
}: {
  user: { email: string; name: string | null };
  workspace: { name: string };
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative border-t-[3px] border-[var(--border)] p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--bg-subtle)]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[var(--border)] bg-[var(--color-bam-400)] text-[11px] font-extrabold text-[#12110e]">
          {initials(user.name ?? user.email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">
            {user.name ?? user.email.split("@")[0]}
          </span>
          <span className="block truncate text-[11px] text-[var(--text-faint)]">
            {workspace.name}
          </span>
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-[var(--text-faint)] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute inset-x-3 bottom-full mb-1 overflow-hidden rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] shadow-[4px_4px_0_0_var(--shadow-ink)]">
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-[13px] hover:bg-[var(--bg-subtle)]"
          >
            <Settings className="h-3.5 w-3.5" /> Settings
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-[var(--color-zap-500)] hover:bg-[var(--bg-subtle)]"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
