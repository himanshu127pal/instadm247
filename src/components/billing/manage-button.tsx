"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";

/** Opens Dodo's hosted portal — invoices, card, cancel. Card details never touch us. */
export function ManageSubscriptionButton() {
  const [busy, setBusy] = React.useState(false);
  async function open() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't open billing.");
      window.location.href = json.url;
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <Button variant="secondary" loading={busy} onClick={() => void open()}>
      Manage subscription & invoices
    </Button>
  );
}
