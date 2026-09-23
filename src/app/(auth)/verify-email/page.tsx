import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/marketing/bits";
import { getCurrentUser } from "@/lib/auth";
import { verifyEmail } from "@/lib/email/tokens";

export const metadata: Metadata = { title: "Verify your email", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await verifyEmail(token) : "invalid";
  const user = await getCurrentUser();
  const next = user ? { href: "/dashboard", label: "Go to your dashboard" } : { href: "/login", label: "Sign in" };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16">
      <Logo className="mb-10 self-start" />
      {result === "verified" ? (
        <>
          <h1 className="font-display text-[30px]">You&apos;re verified</h1>
          <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">
            Thanks for confirming your email. Billing receipts and account alerts will come here.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-[30px]">That link didn&apos;t work</h1>
          <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">
            It may have expired — they last 24 hours — or a newer one was sent after it. Sign in and use{" "}
            <span className="text-[var(--text)]">Resend email</span> on the banner at the top of your dashboard.
          </p>
        </>
      )}
      <Link href={next.href} className="mt-6 text-[14px] font-medium text-[var(--accent)] hover:underline">
        {next.label} →
      </Link>
    </div>
  );
}
