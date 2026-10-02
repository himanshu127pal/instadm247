import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/marketing/bits";
import { MetaBadge } from "@/components/marketing/meta-badge";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const toBilling = plan === "pro" || plan === "business";
  if (await getCurrentUser()) redirect(toBilling ? "/dashboard/billing" : "/dashboard");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16">
      <Logo className="mb-10 self-start" />
      <h1 className="font-display text-[30px]">Create your account</h1>
      <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">
        Free to start. Connect Instagram whenever you&rsquo;re ready.
      </p>
      <div className="mt-3">
        <MetaBadge />
      </div>

      <div className="mt-8">
        <AuthForm mode="signup" toBilling={toBilling} />
      </div>

      <p className="mt-6 text-[13.5px] text-[var(--text-muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </p>

      <p className="mt-8 text-[12px] leading-relaxed text-[var(--text-faint)]">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline hover:text-[var(--text-muted)]">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-[var(--text-muted)]">
          privacy policy
        </Link>
        . Paid plans are covered by our{" "}
        <Link href="/refunds" className="underline hover:text-[var(--text-muted)]">
          refund policy
        </Link>
        .
      </p>
    </div>
  );
}
