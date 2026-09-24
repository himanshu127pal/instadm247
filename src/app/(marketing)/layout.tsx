import Link from "next/link";
import { Logo, ScrollProgress, ThemeToggle } from "@/components/marketing/bits";
import { Button } from "@/components/ui";
import { MarketingNav } from "@/components/marketing/nav";
import { FEATURES } from "@/content/features";
import { COMPARISONS } from "@/content/compare";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <ScrollProgress />
      <MarketingNav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

function Footer() {
  const columns = [
    {
      title: "Features",
      links: [
        ...FEATURES.slice(0, 6).map((f) => ({ label: f.name, href: `/features/${f.slug}` })),
        { label: "All features", href: "/features" },
      ],
    },
    {
      title: "Compare",
      links: [
        ...COMPARISONS.map((c) => ({ label: `vs ${c.name}`, href: `/compare/${c.slug}` })),
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Blog", href: "/blog" },
        { label: "Account safety", href: "/features/account-safety" },
        { label: "Sign in", href: "/login" },
        { label: "Create account", href: "/signup" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy policy", href: "/privacy" },
        { label: "Terms of service", href: "/terms" },
        { label: "Refund policy", href: "/refunds" },
        { label: "Data deletion", href: "/data-deletion" },
      ],
    },
  ];

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-subtle)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-[var(--text-muted)]">
            Instagram DM automation for creators and brands, built entirely on
            Meta&rsquo;s official APIs.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <Link href="/signup">
              <Button size="sm" variant="primary">
                Get started
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <p className="mb-3 text-[12px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
              {column.title}
            </p>
            <ul className="space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[13.5px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] px-5 py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-[12px] text-[var(--text-faint)] sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="space-y-1">
            <p>© {new Date().getFullYear()} InstaDM247. All rights reserved.</p>
            <p>
              InstaDM247 is the registered trade name of Rajat Pal, a
              proprietorship registered in India · GSTIN 09CVWPP3468C1ZX ·{" "}
              <a
                href="mailto:support@instadm247.com"
                className="underline underline-offset-2 transition-colors hover:text-[var(--text)]"
              >
                support@instadm247.com
              </a>
            </p>
          </div>
          <p className="sm:max-w-[19rem] sm:shrink-0 sm:text-right">
            Not affiliated with or endorsed by Meta. Instagram is a trademark of
            Meta Platforms, Inc.
          </p>
        </div>
      </div>
    </footer>
  );
}
