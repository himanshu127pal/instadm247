import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformStaff } from "@/lib/admin";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Platform admin",
  // Internal tooling should never appear in a search index.
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/meta", label: "Meta app" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getPlatformStaff();

  // 404 rather than 403: a stranger probing /admin learns nothing about
  // whether the route exists.
  if (!staff) notFound();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b-2 border-[var(--border-soft)] bg-[var(--bg-raised)]">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <LogoMark className="h-7 w-7" title="" />
            <span className="text-[15px] font-extrabold">Platform admin</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-[13.5px] font-bold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[12.5px] font-semibold text-[var(--text-faint)]">
            <span>{staff.email}</span>
            <span className="rounded-full border-2 border-[var(--border-soft)] px-2 py-0.5 uppercase tracking-wide">
              {staff.role}
            </span>
            <Link href="/dashboard" className="underline underline-offset-2 hover:text-[var(--text)]">
              Exit
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
