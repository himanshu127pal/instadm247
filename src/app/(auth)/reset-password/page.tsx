import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/marketing/bits";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export const metadata: Metadata = { title: "Set a new password", referrer: "no-referrer" };

/**
 * Opening the link only shows the form; the token is spent when it's
 * submitted. A mail scanner that follows the link therefore can't use it up.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16">
      <Logo className="mb-10 self-start" />
      <h1 className="font-display text-[30px]">Set a new password</h1>

      <div className="mt-8">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-[14px] text-[var(--text-muted)]">
            This link is incomplete. Open the one in your email again, or{" "}
            <Link href="/forgot-password" className="font-medium text-[var(--accent)] hover:underline">
              ask for a new one
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
