"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  MessageSquare,
  MessagesSquare,
  MousePointerClick,
  Radio,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

type Account = { id: string; username: string; profilePictureUrl: string | null };
type Media = {
  id: string;
  accountId: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  timestamp: string | null;
};
type Preset = {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  matchMode: string;
  keywords: string[];
};

const TRIGGERS = [
  {
    id: "COMMENT",
    icon: MessageSquare,
    label: "Comment on a post or Reel",
    hint: "The classic comment-to-DM",
  },
  {
    id: "STORY_REPLY",
    icon: MessagesSquare,
    label: "Story reply or reaction",
    hint: "Someone replies to a story, or reacts with an emoji",
  },
  { id: "STORY_MENTION", icon: AtSign, label: "Story @mention", hint: "Great for giveaways" },
  { id: "LIVE_COMMENT", icon: Radio, label: "Live comment", hint: "During a broadcast" },
  { id: "DM_KEYWORD", icon: MessagesSquare, label: "DM keyword", hint: "Someone messages you" },
  {
    id: "AD_COMMENT",
    icon: Zap,
    label: "Comment on an ad or boosted post",
    hint: "Attributed to the ad",
  },
  {
    id: "ICE_BREAKER",
    icon: MousePointerClick,
    label: "Conversation starter",
    hint: "They tap a starter in your inbox",
  },
] as const;

/** Triggers where choosing specific posts makes sense. */
const MEDIA_TRIGGERS = new Set(["COMMENT", "LIVE_COMMENT", "AD_COMMENT"]);

export function NewAutomationWizard({
  accounts,
  media,
  presets,
}: {
  accounts: Account[];
  media: Media[];
  presets: Preset[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [creating, setCreating] = React.useState(false);

  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [triggerType, setTriggerType] = React.useState<string>("COMMENT");
  const [scope, setScope] = React.useState("ALL_MEDIA");
  const [matchMode, setMatchMode] = React.useState("KEYWORD");
  const [keywordInput, setKeywordInput] = React.useState("LINK");
  const [mediaIds, setMediaIds] = React.useState<string[]>([]);
  const [presetId, setPresetId] = React.useState(presets[0]?.id ?? "blank");
  const [name, setName] = React.useState("");

  const keywords = keywordInput
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  // Reaction and written-reply modes only exist for story replies.
  React.useEffect(() => {
    if (triggerType !== "STORY_REPLY" && (matchMode === "REACTION" || matchMode === "REPLY")) {
      setMatchMode("KEYWORD");
    }
  }, [triggerType, matchMode]);

  const accountMedia = media.filter((m) => m.accountId === accountId);
  const supportsMedia = MEDIA_TRIGGERS.has(triggerType);

  const steps = ["Trigger", "Match", "Flow"];

  const canContinue =
    step === 0
      ? Boolean(accountId && triggerType)
      : step === 1
        ? matchMode !== "KEYWORD" || keywords.length > 0
        : Boolean(presetId);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          name:
            name.trim() ||
            suggestName(triggerType === "STORY_REPLY" && matchMode === "REACTION" ? "STORY_REACTION" : triggerType, keywords),
          triggerType,
          scope: supportsMedia ? scope : "ALL_MEDIA",
          matchMode,
          keywords: matchMode === "KEYWORD" ? keywords : [],
          mediaIds: scope === "SPECIFIC" ? mediaIds : [],
          presetId,
        }),
      });
      const data = (await res.json()) as { automation?: { id: string }; error?: string };

      if (!res.ok || !data.automation) {
        throw new Error(data.error ?? "Could not create the automation");
      }
      toast.success("Automation created — now build the flow");
      router.push(`/dashboard/automations/${data.automation.id}`);
    } catch (error) {
      toast.error((error as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Progress */}
      <ol className="flex items-center gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors",
                i < step
                  ? "bg-[var(--color-boom-400)] text-white"
                  : i === step
                    ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                    : "bg-[var(--bg-sunken)] text-[var(--text-faint)]",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[12.5px]",
                i === step ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-[var(--border)]" />}
          </li>
        ))}
      </ol>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-5 rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]"
      >
        {step === 0 && (
          <>
            {accounts.length > 1 && (
              <Field label="Instagram account">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      @{account.username}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <div>
              <p className="mb-2 text-[13px] font-medium">What starts this automation?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TRIGGERS.map((trigger) => {
                  const Icon = trigger.icon;
                  const active = trigger.id === triggerType;
                  return (
                    <button
                      key={trigger.id}
                      onClick={() => setTriggerType(trigger.id)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)]/8"
                          : "border-[var(--border)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                          active
                            ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                            : "bg-[var(--bg-sunken)] text-[var(--text-muted)]",
                        )}
                      >
                        <Icon className="h-[14px] w-[14px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{trigger.label}</span>
                        <span className="block text-[11.5px] text-[var(--text-muted)]">
                          {trigger.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <p className="mb-2 text-[13px] font-medium">Who should it respond to?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "KEYWORD",
                    title: "Only specific keywords",
                    body: "Fires when their message contains one of your keywords.",
                  },
                  {
                    id: "ALL",
                    title: "Everyone",
                    body:
                      triggerType === "STORY_REPLY"
                        ? "Fires on every reply and every emoji reaction to your stories."
                        : "Fires on every comment or message, whatever they say.",
                  },
                  ...(triggerType === "STORY_REPLY"
                    ? [
                        {
                          id: "REACTION",
                          title: "Emoji reactions only",
                          body: "Fires when someone taps an emoji under your story. Heart likes aren't shared with apps, so they can't trigger it.",
                        },
                        {
                          id: "REPLY",
                          title: "Written replies only",
                          body: "Fires when someone types a reply, and ignores emoji-only reactions.",
                        },
                      ]
                    : []),
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setMatchMode(option.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      matchMode === option.id
                        ? "border-[var(--accent)] bg-[var(--accent)]/8"
                        : "border-[var(--border)] hover:border-[var(--border-strong)]",
                    )}
                  >
                    <span className="block text-[13px] font-medium">{option.title}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                      {option.body}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {matchMode === "KEYWORD" && (
              <Field
                label="Keywords"
                hint="Separate with commas. Matching ignores case, accents and emoji."
              >
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="LINK, SHOP, PRICE"
                />
                {keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {keywords.map((keyword) => (
                      <Badge key={keyword} tone="brand">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>
            )}

            {supportsMedia && (
              <Field label="Which posts?">
                <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="ALL_MEDIA">All my posts and Reels</option>
                  <option value="SPECIFIC">Only the posts I pick</option>
                  <option value="UNIVERSAL">Everything, including future posts and ads</option>
                  <option value="AD">Only ads and boosted posts</option>
                </Select>
              </Field>
            )}

            {supportsMedia && scope === "SPECIFIC" && (
              <div>
                <p className="mb-2 text-[13px] font-medium">
                  Pick posts{" "}
                  <span className="font-normal text-[var(--text-faint)]">
                    ({mediaIds.length} selected)
                  </span>
                </p>
                {accountMedia.length === 0 ? (
                  <p className="rounded-xl border-[2.5px] border-dashed border-[var(--border)] p-4 text-center text-[12.5px] text-[var(--text-muted)]">
                    No posts synced yet. Connect Instagram and sync, or choose &ldquo;All my
                    posts&rdquo; and it&rsquo;ll work on everything.
                  </p>
                ) : (
                  <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto rounded-xl border-2 border-[var(--border)] p-2 sm:grid-cols-6">
                    {accountMedia.map((item) => {
                      const selected = mediaIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() =>
                            setMediaIds((current) =>
                              selected
                                ? current.filter((id) => id !== item.id)
                                : [...current, item.id],
                            )
                          }
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                            selected
                              ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/25"
                              : "border-transparent hover:border-[var(--border-strong)]",
                          )}
                          title={item.caption ?? undefined}
                        >
                          {item.thumbnailUrl || item.mediaUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbnailUrl ?? item.mediaUrl ?? ""}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center bg-[var(--bg-sunken)] text-[10px] text-[var(--text-faint)]">
                              {item.mediaType ?? "post"}
                            </span>
                          )}
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
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Name this automation" hint="Just for you — people never see it.">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={suggestName(triggerType, keywords)}
              />
            </Field>

            <div>
              <p className="mb-2 text-[13px] font-medium">Start from</p>
              <div className="space-y-2">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setPresetId(preset.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
                      presetId === preset.id
                        ? "border-[var(--accent)] bg-[var(--accent)]/8"
                        : "border-[var(--border)] hover:border-[var(--border-strong)]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                        presetId === preset.id
                          ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                          : "bg-[var(--bg-sunken)] text-[var(--text-muted)]",
                      )}
                    >
                      <Sparkles className="h-[14px] w-[14px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">{preset.name}</span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--text-muted)]">
                        {preset.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              It&rsquo;ll be created switched off so you can finish the flow first. Turn it
              on from the builder when you&rsquo;re happy.
            </p>
          </>
        )}
      </motion.div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {step < steps.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canContinue}
          >
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="gradient" onClick={create} loading={creating} disabled={!canContinue}>
            Create and build the flow <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function suggestName(triggerType: string, keywords: string[]): string {
  const base: Record<string, string> = {
    COMMENT: "Comment to DM",
    AD_COMMENT: "Ad comment to DM",
    LIVE_COMMENT: "Live comment to DM",
    STORY_REPLY: "Story reply auto-reply",
    STORY_REACTION: "Story reaction auto-reply",
    STORY_MENTION: "Story mention auto-reply",
    DM_KEYWORD: "DM keyword auto-reply",
    ICE_BREAKER: "Conversation starter",
  };
  const name = base[triggerType] ?? "Automation";
  return keywords.length ? `${name} — ${keywords[0]}` : name;
}
