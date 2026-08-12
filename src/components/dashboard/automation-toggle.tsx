"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui";

export function AutomationToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(enabled);
  const [pending, setPending] = React.useState(false);

  async function toggle(next: boolean) {
    setChecked(next); // optimistic
    setPending(true);
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok || data.error) {
        setChecked(!next); // roll back
        toast.error(data.error ?? "Could not update this automation.");
        return;
      }
      toast.success(next ? "Automation is live" : "Automation paused");
      router.refresh();
    } catch {
      setChecked(!next);
      toast.error("Couldn't reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Switch
      checked={checked}
      onCheckedChange={toggle}
      disabled={pending}
      label={checked ? "Pause automation" : "Turn automation on"}
    />
  );
}
