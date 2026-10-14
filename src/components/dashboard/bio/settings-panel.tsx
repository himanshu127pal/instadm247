"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Switch } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { cleanSlug, useSlugAvailability, type BioAccount, type BioDraft } from "./shared";

type Update = (changes: Partial<BioDraft> | ((d: BioDraft) => Partial<BioDraft>)) => void;

export function SettingsPanel({
  draft,
  update,
  pageId,
  appUrl,
  accounts,
  branded,
}: {
  draft: BioDraft;
  update: Update;
  pageId: string;
  appUrl: string;
  accounts: BioAccount[];
  branded: boolean;
}) {
  const router = useRouter();
  const slugState = useSlugAvailability(draft.slug, pageId);

  async function remove() {
    if (!confirm(`Delete "${draft.title}"? The link stops working immediately.`)) return;
    const res = await fetch("/api/bio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pageId }),
    });
    if (!res.ok) return toast.error("Could not delete the page");
    toast.success("Page deleted");
    router.push("/dashboard/bio");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Link and account">
        <div className="space-y-4">
          <Field
            label="Link"
            hint={
              slugState.status === "available"
                ? `✓ Available: ${appUrl}/l/${draft.slug}`
                : slugState.status === "checking"
                  ? "Checking…"
                  : `${appUrl}/l/${draft.slug || "your-name"}. Changing it breaks the old link wherever you've shared it.`
            }
            error={slugState.status === "unavailable" ? slugState.message : undefined}
          >
            <Input value={draft.slug} onChange={(e) => update({ slug: cleanSlug(e.target.value) })} placeholder="demo-studio" />
          </Field>
          {accounts.length > 0 && (
            <Field label="Instagram account" hint="Shows your @handle, and your Instagram photo unless you've added another.">
              <Select value={draft.accountId} onChange={(e) => update({ accountId: e.target.value })}>
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Page settings">
        <div className="space-y-4">
          <Setting
            label="Published"
            hint={draft.published ? "Anyone with the link can see the page." : "Draft: the link shows a not-found page until you publish."}
            checked={draft.published}
            onChange={(v) => update({ published: v })}
          />
          <Setting
            label="Share button"
            hint="A button in the corner so visitors can share your page."
            checked={draft.design.showShare}
            onChange={(v) => update((d) => ({ design: { ...d.design, showShare: v } }))}
          />
          <Setting
            label={`Show "Made with InstaDM247"`}
            hint={branded ? "Always on for the Free plan." : "A small badge at the bottom of the page."}
            checked={branded || draft.showBadge}
            disabled={branded}
            onChange={(v) => update({ showBadge: v })}
            extra={
              branded ? (
                <a href="/dashboard/billing" className="text-[12px] font-bold text-[var(--accent)] underline">
                  Upgrade to remove it
                </a>
              ) : null
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Delete this page">
        <p className="mb-3 text-[13px] text-[var(--text-muted)]">The link stops working straight away, and its view and tap counts are deleted.</p>
        <Button variant="ghost" className="text-[var(--color-zap-500)]" onClick={remove}>
          <Trash2 className="h-4 w-4" /> Delete page
        </Button>
      </SectionCard>
    </div>
  );
}

function Setting({
  label,
  hint,
  checked,
  disabled,
  onChange,
  extra,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} label={label} />
      <span>
        <span className="block text-[13.5px] font-bold">{label}</span>
        <span className="block text-[12px] text-[var(--text-muted)]">{hint}</span>
        {extra}
      </span>
    </div>
  );
}
