"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Menu as MenuIcon, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Field, Input, Select, Switch } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";

export type MenuItem = { type: string; title: string; url?: string; payload?: string };

/**
 * DM Main Menu — Instagram's persistent menu (SendDM's "20 items").
 *
 * Unlike conversation starters, this stays visible for the whole thread, so
 * it's the durable navigation of a DM conversation.
 */
export function MenuTab({
  accounts,
  menus,
}: {
  accounts: Array<{ id: string; username: string }>;
  menus: Array<{ accountId: string; enabled: boolean; items: MenuItem[] }>;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const existing = menus.find((m) => m.accountId === accountId);

  const [items, setItems] = React.useState<MenuItem[]>(existing?.items ?? []);
  const [enabled, setEnabled] = React.useState(existing?.enabled ?? false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const current = menus.find((m) => m.accountId === accountId);
    setItems(current?.items ?? []);
    setEnabled(current?.enabled ?? false);
  }, [accountId, menus]);

  function patch(i: number, changes: Partial<MenuItem>) {
    setItems((current) => current.map((item, j) => (j === i ? { ...item, ...changes } : item)));
  }

  function move(i: number, direction: -1 | 1) {
    const target = i + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[i], next[target]] = [next[target], next[i]];
    setItems(next);
  }

  async function save() {
    const cleaned = items.filter((item) => item.title.trim());
    if (enabled && cleaned.length === 0) {
      toast.error("Add at least one item, or switch the menu off.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          enabled,
          items: cleaned.map((item) =>
            item.type === "web_url"
              ? { type: "web_url", title: item.title.trim(), url: item.url }
              : { type: "postback", title: item.title.trim(), payload: item.payload || item.title },
          ),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the menu");

      toast.success(enabled ? "Menu published to Instagram" : "Menu removed from Instagram");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<MenuIcon />}
        title="Connect an account first"
        description="The main menu lives inside your Instagram DM thread, so it belongs to a specific account."
      />
    );
  }

  return (
    <SectionCard
      title="DM main menu"
      description="Always-visible navigation inside your DM thread. Up to 20 items."
    >
      <div className="space-y-4">
        {accounts.length > 1 && (
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <label className="flex items-center gap-3 rounded-xl border-2 border-[var(--border)] p-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} label="Show the menu" />
          <span className="text-[13px] font-bold">
            {enabled ? "Menu is shown in DMs" : "Menu is hidden"}
          </span>
        </label>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="space-y-2 rounded-xl border-2 border-[var(--border)] p-3">
              <div className="flex items-center gap-2">
                <Select
                  value={item.type}
                  onChange={(e) => patch(i, { type: e.target.value })}
                  className="w-auto min-w-[130px]"
                >
                  <option value="web_url">Opens a link</option>
                  <option value="postback">Triggers an automation</option>
                </Select>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Move down"
                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    aria-label="Remove item"
                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] hover:text-[var(--color-zap-500)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={item.title}
                  maxLength={30}
                  onChange={(e) => patch(i, { title: e.target.value })}
                  placeholder="Menu label"
                />
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-faint)]">
                  {item.title.length}/30
                </span>
              </div>

              {item.type === "web_url" ? (
                <Input
                  value={item.url ?? ""}
                  onChange={(e) => patch(i, { url: e.target.value })}
                  placeholder="https://…"
                />
              ) : (
                <Input
                  value={item.payload ?? ""}
                  onChange={(e) => patch(i, { payload: e.target.value })}
                  placeholder="Payload to match in a 'Button tapped' automation"
                />
              )}
            </div>
          ))}

          {items.length < 20 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setItems([...items, { type: "web_url", title: "", url: "https://example.com" }])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add a menu item
            </Button>
          )}
        </div>

        <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] font-medium leading-relaxed text-[var(--text-muted)]">
          Items that trigger an automation send a postback. Create an automation with the{" "}
          <strong className="text-[var(--text)]">Button tapped</strong> trigger and match the
          payload to answer them.
        </p>

        <Button variant="primary" onClick={save} loading={saving}>
          Save and publish to Instagram
        </Button>
      </div>
    </SectionCard>
  );
}
