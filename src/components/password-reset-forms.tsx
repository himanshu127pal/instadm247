"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Field, Input } from "@/components/ui";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export function ForgotPasswordForm() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  if (sentTo) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--bg-raised)] p-5 text-[14px] leading-relaxed">
        <p className="font-bold">Check your inbox</p>
        <p className="mt-1.5 text-[var(--text-muted)]">
          If <span className="text-[var(--text)]">{sentTo}</span> has an account, a link to reset its password is on its
          way. It works for one hour. Nothing there after a few minutes? Check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        const result = await post("/api/auth/forgot", { email });
        setLoading(false);
        if (result.ok) setSentTo(email);
        else setError(result.error ?? null);
      }}
    >
      <Field label="Email" error={error ?? undefined}>
        <Input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
      </Field>
      <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--bg-raised)] p-5 text-[14px] leading-relaxed">
        <p className="font-bold">Password changed</p>
        <p className="mt-1.5 text-[var(--text-muted)]">
          You&apos;ve been signed out everywhere else. Sign in with your new password.
        </p>
        <Link href="/login" className="mt-3 inline-block font-medium text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        if (password !== String(form.get("confirm") ?? "")) {
          setError("The two passwords don't match.");
          return;
        }
        setLoading(true);
        const result = await post("/api/auth/reset", { token, password });
        setLoading(false);
        if (result.ok) setDone(true);
        else setError(result.error ?? null);
      }}
    >
      <Field label="New password" hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" error={error ?? undefined}>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
        Set new password
      </Button>
    </form>
  );
}
