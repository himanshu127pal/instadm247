import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/marketing/bits";
import { ForgotPasswordForm } from "@/components/password-reset-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16">
      <Logo className="mb-10 self-start" />
      <h1 className="font-display text-[30px]">Forgot your password?</h1>
      <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">
        Enter the email you signed up with and we&apos;ll send you a link to set a new one.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm />
      </div>

      <p className="mt-6 text-[13.5px] text-[var(--text-muted)]">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
