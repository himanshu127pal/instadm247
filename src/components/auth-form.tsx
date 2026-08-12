"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Field, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(mode === "signup" ? { name: String(form.get("name") ?? "") } : {}),
    };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      toast.success(mode === "signup" ? "Account created" : "Welcome back");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" && (
        <Field label="Your name">
          <Input name="name" placeholder="Alex Rivera" autoComplete="name" required />
        </Field>
      )}

      <Field label="Email">
        <Input
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </Field>

      <Field
        label="Password"
        hint={mode === "signup" ? "At least 8 characters." : undefined}
        error={error ?? undefined}
      >
        <Input
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </Field>

      <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
        {mode === "signup" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
