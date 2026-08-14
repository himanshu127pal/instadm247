import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/marketing/bits";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center px-5 py-16">
      <Logo className="mb-10 self-start" />
      <h1 className="font-display text-[30px]">Welcome back</h1>
      <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">
        Sign in to pick up where your automations left off.
      </p>

      <div className="mt-8">
        <AuthForm mode="login" />
      </div>

      <p className="mt-6 text-[13.5px] text-[var(--text-muted)]">
        New here?{" "}
        <Link href="/signup" className="font-medium text-[var(--accent)] hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
