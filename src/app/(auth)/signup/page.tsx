import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/marketing/bits";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16">
      <Logo className="mb-10 self-start" />
      <h1 className="text-[26px] font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">
        Free to start. Connect Instagram whenever you&rsquo;re ready.
      </p>

      <div className="mt-8">
        <AuthForm mode="signup" />
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
        .
      </p>
    </div>
  );
}
