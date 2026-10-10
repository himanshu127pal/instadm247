"use client";

import { RemoteImg } from "@/components/ui/remote-img";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, BarChart3, Check, Settings2, Trash2, Workflow } from "lucide-react";
import type { FlowGraph } from "@/lib/engine/schema";
import { Badge, Button, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { SectionCard, Tabs } from "@/components/dashboard/bits";
import { FunnelChart } from "@/components/dashboard/charts";
import { FlowBuilder } from "@/components/flow/builder";
import type { FormOption } from "@/components/flow/inspector";
import { RewindPanel } from "@/components/dashboard/rewind-panel";
import { cn } from "@/lib/utils";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: string;
  scope: string;
  matchMode: string;
  matchType: string;
  keywords: string[];
  negativeKeywords: string[];
  caseSensitive: boolean;
  fuzzyMatch: boolean;
  reentryPolicy: string;
  cooldownMinutes: number | null;
  mediaIds: string[];
  accountUsername: string;
};

type Media = {
  id: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  timestamp: string | null;
};

export function AutomationEditor({
  automation: initial,
  graph,
  media,
  funnel,
  graphRecovered,
  forms = [],
}: {
  automation: Automation;
  graph: FlowGraph;
  media: Media[];
  funnel: { totalRuns: number; nodes: Array<{ nodeId: string; nodeType: string; entered: number; rate: number }> };
  graphRecovered: boolean;
  forms?: FormOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState("flow");
  const [automation, setAutomation] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [flowDirty, setFlowDirty] = React.useState(false);

  function patch(changes: Partial<Automation>) {
    setAutomation((current) => ({ ...current, ...changes }));
  }

  async function persist(changes: Partial<Automation> & { enabled?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/automations/${automation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not save");
      router.refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(next: boolean) {
    const previous = automation.enabled;
    patch({ enabled: next });
    const okResult = await persist({ enabled: next });
    if (!okResult) {
      patch({ enabled: previous });
      return;
    }
    toast.success(next ? "This automation is live" : "Automation paused");
  }

  async function saveSettings() {
    const okResult = await persist({
      name: automation.name,
      description: automation.description,
      triggerType: automation.triggerType,
      scope: automation.scope,
      matchMode: automation.matchMode,
      matchType: automation.matchType,
      keywords: automation.keywords,
      negativeKeywords: automation.negativeKeywords,
      caseSensitive: automation.caseSensitive,
      fuzzyMatch: automation.fuzzyMatch,
      reentryPolicy: automation.reentryPolicy,
      cooldownMinutes: automation.cooldownMinutes,
      mediaIds: automation.scope === "SPECIFIC" ? automation.mediaIds : [],
    });
    if (okResult) toast.success("Settings saved");
  }

  async function remove() {
    if (!confirm(`Delete "${automation.name}"? Its runs and stats go with it.`)) return;
    const res = await fetch(`/api/automations/${automation.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Automation deleted");
      router.push("/dashboard/automations");
    } else {
      toast.error("Could not delete this automation.");
    }
  }

  return (
    <div className="space-y-4">
      {graphRecovered && (
        <div className="flex items-start gap-2.5 rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)]/40 shadow-[4px_4px_0_0_var(--shadow-ink)] px-4 py-3 text-[13px] text-[var(--text)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This flow&rsquo;s saved steps couldn&rsquo;t be read, so we&rsquo;ve started you
            from a fresh trigger. Rebuild and save to replace the broken version.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={automation.name}
              onChange={(e) => patch({ name: e.target.value })}
              onBlur={() => persist({ name: automation.name })}
              className="min-w-0 max-w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[22px] font-semibold tracking-tight outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--accent)]"
              aria-label="Automation name"
            />
            <Badge tone={automation.enabled ? "success" : "neutral"}>
              {automation.enabled ? "Live" : "Paused"}
            </Badge>
          </div>
          <p className="mt-1 px-1 text-[13px] text-[var(--text-muted)]">
            Listening on @{automation.accountUsername}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--text-muted)]">
            {automation.enabled ? "Live" : "Paused"}
          </span>
          <Switch
            checked={automation.enabled}
            onCheckedChange={toggleEnabled}
            disabled={saving}
            label="Toggle automation"
          />
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "flow", label: "Flow" },
          { id: "settings", label: "Trigger settings" },
          { id: "performance", label: "Performance" },
          { id: "rewind", label: "Rewind" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "flow" && (
        <>
          {flowDirty && (
            <p className="text-[12px] text-[var(--color-zonk-500)]">
              You have unsaved changes. Press ⌘S or the Save button.
            </p>
          )}
          <FlowBuilder
            automationId={automation.id}
            initialGraph={graph}
            enabled={automation.enabled}
            forms={forms}
            onDirtyChange={setFlowDirty}
          />
        </>
      )}

      {tab === "settings" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="What it listens for">
            <div className="space-y-4">
              <Field label="Trigger">
                <Select
                  value={automation.triggerType}
                  onChange={(e) =>
                    patch({
                      triggerType: e.target.value,
                      // Reaction / written-reply modes only mean something for story replies.
                      ...(e.target.value !== "STORY_REPLY" &&
                      (automation.matchMode === "REACTION" || automation.matchMode === "REPLY")
                        ? { matchMode: "KEYWORD" }
                        : {}),
                    })
                  }
                >
                  {[
                    ["COMMENT", "Comment on a post or Reel"],
                    ["AD_COMMENT", "Comment on an ad or boosted post"],
                    ["LIVE_COMMENT", "Comment during a Live"],
                    ["STORY_REPLY", "Story reply"],
                    ["STORY_MENTION", "Story @mention"],
                    ["DM_KEYWORD", "Direct message"],
                    ["ICE_BREAKER", "Conversation starter tapped"],
                    ["POSTBACK", "Button tapped"],
                    ["REFERRAL", "Referral link opened"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Which content">
                <Select value={automation.scope} onChange={(e) => patch({ scope: e.target.value })}>
                  <option value="ALL_MEDIA">All my posts and Reels</option>
                  <option value="SPECIFIC">Only the posts I pick</option>
                  <option value="UNIVERSAL">Everything, including future posts and ads</option>
                  <option value="AD">Only ads and boosted posts</option>
                </Select>
              </Field>

              <Field label="Match mode">
                <Select
                  value={automation.matchMode}
                  onChange={(e) => patch({ matchMode: e.target.value })}
                >
                  <option value="KEYWORD">Only specific keywords</option>
                  <option value="ALL">Everyone, whatever they say</option>
                  {automation.triggerType === "STORY_REPLY" && (
                    <>
                      <option value="REACTION">Emoji reactions only</option>
                      <option value="REPLY">Written replies only</option>
                    </>
                  )}
                </Select>
              </Field>

              {automation.matchMode === "KEYWORD" && (
                <>
                  <Field label="Keywords" hint="Comma separated.">
                    <Input
                      value={automation.keywords.join(", ")}
                      onChange={(e) =>
                        patch({
                          keywords: e.target.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="LINK, SHOP"
                    />
                  </Field>

                  <Field label="How to match">
                    <Select
                      value={automation.matchType}
                      onChange={(e) => patch({ matchType: e.target.value })}
                    >
                      <option value="CONTAINS">Message contains the keyword</option>
                      <option value="EXACT">Message is exactly the keyword</option>
                      <option value="STARTS_WITH">Message starts with the keyword</option>
                      <option value="REGEX">Regular expression (advanced)</option>
                    </Select>
                  </Field>
                </>
              )}

              <Field
                label="Never respond to"
                hint="Comma separated. These win over everything, even in 'everyone' mode."
              >
                <Input
                  value={automation.negativeKeywords.join(", ")}
                  onChange={(e) =>
                    patch({
                      negativeKeywords: e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="refund, complaint"
                />
              </Field>

              <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-[var(--border)] p-3">
                <span>
                  <span className="block text-[13px] font-medium">Forgive typos</span>
                  <span className="block text-[11.5px] text-[var(--text-muted)]">
                    Matches &ldquo;recipie&rdquo; to &ldquo;recipe&rdquo;. Short keywords stay exact.
                  </span>
                </span>
                <Switch
                  checked={automation.fuzzyMatch}
                  onCheckedChange={(v) => patch({ fuzzyMatch: v })}
                  label="Forgive typos"
                />
              </label>
            </div>
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="How often it can run">
              <div className="space-y-4">
                <Field label="Per person">
                  <Select
                    value={automation.reentryPolicy}
                    onChange={(e) => patch({ reentryPolicy: e.target.value })}
                  >
                    <option value="ONCE_PER_MEDIA">Once per post (recommended)</option>
                    <option value="ONCE">Only ever once</option>
                    <option value="COOLDOWN">Once per cooldown period</option>
                    <option value="ALWAYS">Every single time</option>
                  </Select>
                </Field>

                {automation.reentryPolicy === "COOLDOWN" && (
                  <Field label="Cooldown (minutes)">
                    <Input
                      type="number"
                      min={1}
                      value={automation.cooldownMinutes ?? 60}
                      onChange={(e) => patch({ cooldownMinutes: Number(e.target.value) || 60 })}
                    />
                  </Field>
                )}

                <Field label="Description" hint="A note to your future self.">
                  <Textarea
                    value={automation.description ?? ""}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="Drives traffic to the spring collection from Reels."
                  />
                </Field>
              </div>
            </SectionCard>

            {automation.scope === "SPECIFIC" && (
              <SectionCard
                title="Posts"
                description={`${automation.mediaIds.length} selected`}
              >
                {media.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    No posts synced yet. Sync the account from the Instagram accounts page.
                  </p>
                ) : (
                  <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                    {media.map((item) => {
                      const selected = automation.mediaIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() =>
                            patch({
                              mediaIds: selected
                                ? automation.mediaIds.filter((id) => id !== item.id)
                                : [...automation.mediaIds, item.id],
                            })
                          }
                          title={item.caption ?? undefined}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                            selected
                              ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/25"
                              : "border-transparent hover:border-[var(--border-strong)]",
                          )}
                        >
                          <RemoteImg
                            src={item.thumbnailUrl ?? item.mediaUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={
                              <span className="grid h-full w-full place-items-center bg-[var(--bg-sunken)] text-[10px] text-[var(--text-faint)]">
                                {item.mediaType ?? "post"}
                              </span>
                            }
                          />
                          {selected && (
                            <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--accent)] text-white">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button variant="primary" onClick={saveSettings} loading={saving}>
                <Settings2 className="h-4 w-4" /> Save settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === "rewind" && <RewindPanel automationId={automation.id} />}

      {tab === "performance" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Funnel"
            description={`${funnel.totalRuns.toLocaleString()} run${funnel.totalRuns === 1 ? "" : "s"} in total`}
          >
            <FunnelChart nodes={funnel.nodes} totalRuns={funnel.totalRuns} />
          </SectionCard>

          <SectionCard title="Reading this">
            <div className="space-y-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
              <p className="flex items-start gap-2">
                <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                Each bar is how many people reached that step. A big drop between two
                steps usually means a delay outlived the messaging window, or a
                condition sent most people down the other branch.
              </p>
              <p className="flex items-start gap-2">
                <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                Steps that never fired won&rsquo;t appear at all. Check they&rsquo;re
                actually connected in the flow.
              </p>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
