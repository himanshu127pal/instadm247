"use client";

import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { FlowNode } from "@/lib/engine/schema";
import type { MessagePayload } from "@/lib/engine/schema";
import { AVAILABLE_TOKENS, previewTemplate } from "@/lib/engine/template";
import { Button, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { NODE_META } from "./nodes";
import { cn } from "@/lib/utils";

/**
 * The configuration panel for whichever node is selected.
 *
 * Everything writes through `onChange(nextNode)`; the builder owns the graph.
 */

/** A lead form an "Ask a question" step can save its answer into. */
export type FormOption = {
  id: string;
  name: string;
  fields: Array<{ id: string; label: string; type: string; options?: string[] }>;
};

export function NodeInspector({
  node,
  forms = [],
  onChange,
  onDelete,
  onClose,
}: {
  node: FlowNode;
  forms?: FormOption[];
  onChange: (node: FlowNode) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const meta = NODE_META[node.type];
  const Icon = meta.icon;

  function patch(data: Partial<FlowNode["data"]>) {
    onChange({ ...node, data: { ...node.data, ...data } } as FlowNode);
  }

  return (
    <aside className="flex h-full w-full flex-col border-l-[3px] border-[var(--border)] bg-[var(--bg-raised)]">
      <header className="flex items-center gap-2.5 border-b-[2.5px] border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-[var(--border)] text-white"
          style={{ backgroundColor: meta.accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold">{meta.label}</p>
          <p className="truncate text-[11px] text-[var(--text-faint)]">{meta.description}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--bg-subtle)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Field label="Step name">
          <Input
            value={node.data.label}
            onChange={(e) => patch({ label: e.target.value })}
            placeholder={meta.label}
          />
        </Field>

        <NodeFields node={node} forms={forms} patch={patch} />
      </div>

      {node.type !== "TRIGGER" && (
        <footer className="border-t-[2.5px] border-[var(--border)] p-4">
          <Button variant="danger" size="sm" className="w-full" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete this step
          </Button>
        </footer>
      )}
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

function NodeFields({
  node,
  forms,
  patch,
}: {
  node: FlowNode;
  forms: FormOption[];
  // The discriminated union makes a precise type here impractical; the builder
  // re-validates the whole graph with Zod before saving.
  patch: (data: Record<string, unknown>) => void;
}) {
  switch (node.type) {
    case "TRIGGER":
      return (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          The trigger is configured in the automation settings: which keyword,
          which posts, and how often the same person can re-enter.
        </p>
      );

    case "SEND_MESSAGE":
      return (
        <>
          <MessageEditor
            value={node.data.message}
            onChange={(message) => patch({ message })}
          />
          <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3">
            <Switch
              checked={node.data.asPrivateReply}
              onCheckedChange={(v) => patch({ asPrivateReply: v })}
              label="Send as a private reply"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Reply privately to the comment</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                The right choice for the first message of a comment-triggered flow.
                It&rsquo;s how Instagram lets you open the conversation. Only one
                private reply is allowed per comment; if an earlier step already sent
                it (an Ask for follow, say), this goes as a normal DM instead.
              </span>
            </span>
          </label>
        </>
      );

    case "REPLY_TO_COMMENT":
      return (
        <Field
          label="Public replies"
          hint="One is picked at random each time, so your comment section doesn't read like a bot."
        >
          <StringList
            values={node.data.replies}
            onChange={(replies) => patch({ replies })}
            placeholder="Just sent it 💌"
          />
        </Field>
      );

    case "DELAY":
      return (
        <>
          <Field
            label="Wait for"
            hint="Instagram closes the messaging window 24 hours after someone contacts you, so this caps at 24h."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={node.data.minutes}
                onChange={(e) =>
                  patch({ minutes: Math.min(1440, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
              <span className="shrink-0 text-[13px] text-[var(--text-muted)]">minutes</span>
            </div>
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {[5, 20, 60, 180, 720, 1380].map((minutes) => (
              <button
                key={minutes}
                onClick={() => patch({ minutes })}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors",
                  node.data.minutes === minutes
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
                )}
              >
                {minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`}
              </button>
            ))}
          </div>
        </>
      );

    case "CONDITION":
      return (
        <>
          <Field label="Match">
            <Select value={node.data.mode} onChange={(e) => patch({ mode: e.target.value })}>
              <option value="all">All conditions</option>
              <option value="any">Any condition</option>
            </Select>
          </Field>
          <ConditionList
            conditions={node.data.conditions}
            onChange={(conditions) => patch({ conditions })}
          />
        </>
      );

    case "FOLLOWER_CHECK":
      return (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          Takes the <strong className="text-[var(--text)]">yes</strong> path when this
          person already follows you and the <strong className="text-[var(--text)]">no</strong>{" "}
          path when they don&rsquo;t. Follower status is read from Instagram and cached
          for an hour.
        </p>
      );

    case "ASK_FOR_FOLLOW":
      return (
        <>
          <MessageEditor value={node.data.message} onChange={(message) => patch({ message })} />
          <Field
            label="Button"
            hint="Added under your message. Instagram only lets us check whether someone follows you after they tap a button or message you, so the tap is what makes the check work, above all for people who came from a comment."
          >
            <Input
              value={node.data.buttonTitle ?? "I've followed ✅"}
              maxLength={20}
              onChange={(e) => patch({ buttonTitle: e.target.value || "I've followed ✅" })}
            />
          </Field>
          <Field label="If they tap but aren't following yet" hint="Sent once, with the button again. A second tap takes the yes or no path.">
            <Textarea
              value={node.data.notFollowingText ?? ""}
              maxLength={1000}
              onChange={(e) => patch({ notFollowingText: e.target.value })}
            />
          </Field>
          <Field
            label="Wait for a tap"
            hint="If nobody taps by then, take the 'no' path. Someone who came from a comment and never tapped or replied can't be messaged again, so the flow stops there for them. People who already follow you skip this step."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={node.data.recheckAfterMinutes}
                onChange={(e) =>
                  patch({
                    recheckAfterMinutes: Math.min(1440, Math.max(1, Number(e.target.value) || 5)),
                  })
                }
              />
              <span className="shrink-0 text-[13px] text-[var(--text-muted)]">minutes</span>
            </div>
          </Field>
        </>
      );

    case "COLLECT_INPUT": {
      const form = forms.find((f) => f.id === node.data.formId);
      // Answer types a form question can have that this step can ask.
      const askable = (type: string) =>
        ["text", "email", "phone", "number", "choice", "rating"].includes(type) ? type : "text";
      return (
        <>
          <Field
            label="Save to a lead form"
            hint={
              forms.length
                ? "Answers are saved as a form response. That's what exports, and what goes to Google Sheets, Kit and Flodesk."
                : "Create one under Lead forms to collect responses you can export or sync."
            }
          >
            <Select
              value={node.data.formId ?? ""}
              onChange={(e) => {
                const next = forms.find((f) => f.id === e.target.value);
                const first = next?.fields[0];
                patch(
                  next && first
                    ? {
                        formId: next.id,
                        variable: first.id,
                        fieldType: askable(first.type),
                        options: first.options,
                        prompt: node.data.prompt || first.label,
                      }
                    : { formId: undefined },
                );
              }}
            >
              <option value="">Don&rsquo;t save to a form</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          {form && (
            <Field
              label="Which question"
              hint={
                form.fields.length > 1
                  ? `Add one "Ask a question" step per question. The response is complete once all ${form.fields.length} are answered.`
                  : undefined
              }
            >
              <Select
                value={node.data.variable}
                onChange={(e) => {
                  const field = form.fields.find((f) => f.id === e.target.value);
                  if (field) {
                    patch({ variable: field.id, fieldType: askable(field.type), options: field.options, prompt: field.label });
                  }
                }}
              >
                {!form.fields.some((f) => f.id === node.data.variable) && <option value="">Choose a question…</option>}
                {form.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label || f.id}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="What to ask">
            <Textarea
              value={node.data.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              placeholder="What's the best email to send this to?"
            />
          </Field>
          {!form && (
            <Field
              label="Save the answer as"
              hint="Use it later with {{variable}} in any message."
            >
              <Input
                value={node.data.variable}
                onChange={(e) =>
                  patch({ variable: e.target.value.replace(/[^\w]/g, "_").toLowerCase() })
                }
                placeholder="email"
              />
            </Field>
          )}
          <Field label="Answer type">
            <Select
              value={node.data.fieldType}
              onChange={(e) => patch({ fieldType: e.target.value })}
            >
              <option value="text">Free text</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="number">Number</option>
              <option value="choice">Multiple choice</option>
              <option value="rating">Rating</option>
            </Select>
          </Field>
          {node.data.fieldType === "choice" && (
            <Field label="Choices" hint="Sent as tappable buttons. Instagram allows up to three.">
              <StringList
                values={node.data.options ?? []}
                onChange={(options) => patch({ options })}
                placeholder="Option"
                max={3}
              />
            </Field>
          )}
          <Field label="Give up after" hint="Then the 'no reply' path runs.">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={node.data.timeoutMinutes}
                onChange={(e) =>
                  patch({
                    timeoutMinutes: Math.min(1440, Math.max(1, Number(e.target.value) || 60)),
                  })
                }
              />
              <span className="shrink-0 text-[13px] text-[var(--text-muted)]">minutes</span>
            </div>
          </Field>
        </>
      );
    }

    case "AI_REPLY":
      return (
        <>
          <Field
            label="Extra instructions"
            hint="Optional. The agent's persona and knowledge base are configured under AI agent."
          >
            <Textarea
              value={node.data.instructions ?? ""}
              onChange={(e) => patch({ instructions: e.target.value })}
              placeholder="Keep answers under two sentences. Always mention free shipping over £60."
            />
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3">
            <Switch
              checked={node.data.handoffOnUnknown}
              onCheckedChange={(v) => patch({ handoffOnUnknown: v })}
              label="Hand off when unsure"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Hand off when unsure</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                Strongly recommended. The agent only answers from your knowledge base;
                without this it stays silent instead of getting you.
              </span>
            </span>
          </label>
        </>
      );

    case "SEND_COUPON":
      return (
        <>
          <Field
            label="Coupon pool"
            hint="Create pools under Templates → Coupons. Unique pools give each person their own code."
          >
            <Input
              value={node.data.poolId}
              onChange={(e) => patch({ poolId: e.target.value.trim() })}
              placeholder="Paste a coupon pool ID"
            />
          </Field>
          <MessageEditor
            value={node.data.message}
            onChange={(message) => patch({ message })}
          />
          <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] font-medium leading-relaxed text-[var(--text-muted)]">
            Use <code className="font-mono font-bold">{"{{coupon}}"}</code> in the message.
            It&rsquo;s replaced with the code this person was issued. Everyone gets at most
            one code from a pool, even if the flow runs again.
          </p>
          <Field
            label="If the pool runs out"
            hint="Sent instead of a code, and the flow takes the 'ran out' path."
          >
            <Input
              value={node.data.emptyMessage ?? ""}
              onChange={(e) => patch({ emptyMessage: e.target.value })}
              placeholder="We've just run out, give me a moment!"
            />
          </Field>
        </>
      );

    case "TAG":
      return (
        <>
          <Field label="Action">
            <Select value={node.data.action} onChange={(e) => patch({ action: e.target.value })}>
              <option value="add">Add tags</option>
              <option value="remove">Remove tags</option>
            </Select>
          </Field>
          <Field label="Tags">
            <StringList
              values={node.data.tags}
              onChange={(tags) => patch({ tags })}
              placeholder="lead"
            />
          </Field>
        </>
      );

    case "SET_FIELD":
      return (
        <>
          <Field label="Field name">
            <Input value={node.data.key} onChange={(e) => patch({ key: e.target.value })} />
          </Field>
          <Field label="Value" hint="Supports {{variables}}.">
            <Input value={node.data.value} onChange={(e) => patch({ value: e.target.value })} />
          </Field>
        </>
      );

    case "RANDOMIZER":
      return (
        <Field label="Paths" hint="Weights are relative: 50/50 and 1/1 behave the same.">
          <div className="space-y-2">
            {node.data.branches.map((branch, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={branch.key}
                  onChange={(e) => {
                    const branches = [...node.data.branches];
                    branches[i] = { ...branch, key: e.target.value };
                    patch({ branches });
                  }}
                  placeholder="A"
                />
                <Input
                  type="number"
                  min={0}
                  className="w-20"
                  value={branch.weight}
                  onChange={(e) => {
                    const branches = [...node.data.branches];
                    branches[i] = { ...branch, weight: Number(e.target.value) || 0 };
                    patch({ branches });
                  }}
                />
                {node.data.branches.length > 2 && (
                  <button
                    onClick={() =>
                      patch({ branches: node.data.branches.filter((_, j) => j !== i) })
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--bg-subtle)] hover:text-red-400"
                    aria-label="Remove path"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                patch({
                  branches: [
                    ...node.data.branches,
                    { key: String.fromCharCode(65 + node.data.branches.length), weight: 50 },
                  ],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add a path
            </Button>
          </div>
        </Field>
      );

    case "HTTP_REQUEST":
      return (
        <>
          <Field label="URL">
            <Input
              value={node.data.url}
              onChange={(e) => patch({ url: e.target.value })}
              placeholder="https://hooks.example.com/inbound"
            />
          </Field>
          <Field label="Method">
            <Select value={node.data.method} onChange={(e) => patch({ method: e.target.value })}>
              {["POST", "GET", "PUT", "PATCH"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          {node.data.method !== "GET" && (
            <Field label="Body" hint="JSON. Supports {{variables}}. Defaults to all collected variables.">
              <Textarea
                value={node.data.body ?? ""}
                onChange={(e) => patch({ body: e.target.value })}
                placeholder={'{ "email": "{{email}}" }'}
                className="font-mono text-[12px]"
              />
            </Field>
          )}
          <Field label="Save the response as" hint="Optional.">
            <Input
              value={node.data.saveAs ?? ""}
              onChange={(e) => patch({ saveAs: e.target.value })}
              placeholder="crm_response"
            />
          </Field>
        </>
      );

    case "HUMAN_HANDOFF":
      return (
        <Field label="Internal note" hint="Shown in the inbox so you know why it landed there.">
          <Input
            value={node.data.note ?? ""}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="Wants a custom quote"
          />
        </Field>
      );

    case "END":
      return (
        <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3">
          <Switch
            checked={node.data.goal}
            onCheckedChange={(v) => patch({ goal: v })}
            label="Count as a conversion"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Count as a conversion</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              Reaching this step counts as a goal in your funnel analytics.
            </span>
          </span>
        </label>
      );
  }
}

/* -------------------------------------------------------------------------- */

function MessageEditor({
  value,
  onChange,
}: {
  value: MessagePayload;
  onChange: (value: MessagePayload) => void;
}) {
  const kinds = [
    { id: "text", label: "Text" },
    { id: "buttons", label: "Buttons" },
    { id: "carousel", label: "Carousel" },
    { id: "image", label: "Image" },
  ] as const;

  function switchKind(kind: string) {
    const text = "text" in value ? value.text : "";
    switch (kind) {
      case "text":
        onChange({ kind: "text", text: text || "Hey {{first_name}}!" });
        break;
      case "buttons":
        onChange({
          kind: "buttons",
          text: text || "Here you go 👇",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        });
        break;
      case "carousel":
        onChange({
          kind: "carousel",
          slides: [{ title: "First slide", subtitle: "A short description" }],
        });
        break;
      case "image":
        onChange({ kind: "image", url: "https://example.com/image.jpg" });
        break;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1">
        {kinds.map((kind) => (
          <button
            key={kind.id}
            onClick={() => switchKind(kind.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[12px] transition-colors",
              value.kind === kind.id
                ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
            )}
          >
            {kind.label}
          </button>
        ))}
      </div>

      {(value.kind === "text" || value.kind === "buttons") && (
        <>
          <Field label="Message">
            <Textarea
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              placeholder="Hey {{first_name}}! Here's what you asked for 👇"
            />
          </Field>
          <TokenPicker
            onInsert={(token) => onChange({ ...value, text: `${value.text}{{${token}}}` })}
          />
          <MessagePreview text={value.text} />
        </>
      )}

      {value.kind === "buttons" && (
        <Field label="Buttons" hint="Instagram allows up to three.">
          <div className="space-y-2">
            {value.buttons.map((button, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-[var(--border)] p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={button.title}
                    maxLength={20}
                    onChange={(e) => {
                      const buttons = [...value.buttons];
                      buttons[i] = { ...button, title: e.target.value };
                      onChange({ ...value, buttons });
                    }}
                    placeholder="Button text"
                  />
                  {value.buttons.length > 1 && (
                    <button
                      onClick={() =>
                        onChange({ ...value, buttons: value.buttons.filter((_, j) => j !== i) })
                      }
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-faint)] hover:text-red-400"
                      aria-label="Remove button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {button.type === "web_url" && (
                  <Input
                    value={button.url}
                    onChange={(e) => {
                      const buttons = [...value.buttons];
                      buttons[i] = { ...button, url: e.target.value };
                      onChange({ ...value, buttons });
                    }}
                    placeholder="https://…"
                  />
                )}
              </div>
            ))}
            {value.buttons.length < 3 && (
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...value,
                      buttons: [
                        ...value.buttons,
                        { type: "web_url", title: "Another link", url: "https://example.com" },
                      ],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add a button
                </Button>

                {/* SendDM's "WhatsApp/Email redirect", as one-tap presets. */}
                <div className="flex flex-wrap gap-1.5">
                  {REDIRECT_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      onClick={() =>
                        onChange({
                          ...value,
                          buttons: [
                            ...value.buttons,
                            { type: "web_url", title: preset.title, url: preset.url },
                          ],
                        })
                      }
                      className="rounded-lg border-2 border-[var(--border)] bg-[var(--bg-sunken)] px-2 py-1 text-[11px] font-bold transition-colors hover:bg-[var(--color-pow-400)]"
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Field>
      )}

      {value.kind === "carousel" && (
        <Field label="Slides" hint="Up to 10, Instagram's limit for a carousel DM.">
          <div className="space-y-2">
            {value.slides.map((slide, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-[var(--border)] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-faint)]">Slide {i + 1}</span>
                  {value.slides.length > 1 && (
                    <button
                      onClick={() =>
                        onChange({ ...value, slides: value.slides.filter((_, j) => j !== i) })
                      }
                      className="text-[var(--text-faint)] hover:text-red-400"
                      aria-label="Remove slide"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  value={slide.title}
                  maxLength={80}
                  onChange={(e) => {
                    const slides = [...value.slides];
                    slides[i] = { ...slide, title: e.target.value };
                    onChange({ ...value, slides });
                  }}
                  placeholder="Slide title"
                />
                <Input
                  value={slide.subtitle ?? ""}
                  maxLength={80}
                  onChange={(e) => {
                    const slides = [...value.slides];
                    slides[i] = { ...slide, subtitle: e.target.value };
                    onChange({ ...value, slides });
                  }}
                  placeholder="Subtitle"
                />
                <Input
                  value={slide.image_url ?? ""}
                  onChange={(e) => {
                    const slides = [...value.slides];
                    slides[i] = { ...slide, image_url: e.target.value };
                    onChange({ ...value, slides });
                  }}
                  placeholder="Image URL"
                />
              </div>
            ))}
            {value.slides.length < 10 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  onChange({
                    ...value,
                    slides: [...value.slides, { title: `Slide ${value.slides.length + 1}` }],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add a slide
              </Button>
            )}
          </div>
        </Field>
      )}

      {(value.kind === "image" || value.kind === "video" || value.kind === "audio") && (
        <Field label="File URL" hint="Must be a public HTTPS URL Instagram can fetch.">
          <Input
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            placeholder="https://example.com/image.jpg"
          />
        </Field>
      )}
    </div>
  );
}

/**
 * One-tap redirects out of Instagram. The placeholders are obvious enough that
 * an unedited one is clearly unfinished rather than quietly broken.
 */
const REDIRECT_PRESETS = [
  { label: "WhatsApp", title: "Chat on WhatsApp", url: "https://wa.me/1234567890" },
  { label: "Email", title: "Email us", url: "mailto:hello@example.com" },
  { label: "Call", title: "Call us", url: "tel:+1234567890" },
  { label: "Book a call", title: "Book a time", url: "https://cal.com/your-handle" },
] as const;

function TokenPicker({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {AVAILABLE_TOKENS.map((token) => (
        <button
          key={token.token}
          onClick={() => onInsert(token.token)}
          title={token.description}
          className="rounded-lg border border-[var(--border)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {`{{${token.token}}}`}
        </button>
      ))}
    </div>
  );
}

function MessagePreview({ text }: { text: string }) {
  if (!text.trim()) return null;
  const bytes = new TextEncoder().encode(text).length;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-3">
      <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
        Preview
      </p>
      <div className="max-w-[86%] rounded-2xl rounded-tl-md bg-[var(--bg-raised)] px-3 py-2">
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">
          {previewTemplate(text)}
        </p>
      </div>
      <p
        className={cn(
          "mt-1.5 text-[10.5px]",
          bytes > 1000 ? "text-red-400" : "text-[var(--text-faint)]",
        )}
      >
        {bytes} / 1000 bytes{bytes > 1000 ? ". Instagram will cut this off" : ""}
      </p>
    </div>
  );
}

function StringList({
  values,
  onChange,
  placeholder,
  max = 20,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
          />
          {values.length > 1 && (
            <button
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-faint)] hover:text-red-400"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {values.length < max && (
        <Button variant="secondary" size="sm" onClick={() => onChange([...values, ""])}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      )}
    </div>
  );
}

function ConditionList({
  conditions,
  onChange,
}: {
  conditions: Array<{ field: string; operator: string; key?: string; value?: string }>;
  onChange: (conditions: Array<{ field: string; operator: string; key?: string; value?: string }>) => void;
}) {
  const FIELDS = [
    { id: "is_follower", label: "Follows you" },
    { id: "has_tag", label: "Has tag" },
    { id: "custom_field", label: "Custom field" },
    { id: "variable", label: "Collected answer" },
    { id: "message_text", label: "What they said" },
    { id: "hour_of_day", label: "Hour of day" },
    { id: "is_first_time", label: "First time here" },
    { id: "replied", label: "Replied since your last message" },
  ];
  const OPERATORS = [
    { id: "is_true", label: "is true" },
    { id: "is_false", label: "is false" },
    { id: "equals", label: "equals" },
    { id: "not_equals", label: "does not equal" },
    { id: "contains", label: "contains" },
    { id: "not_contains", label: "does not contain" },
    { id: "greater_than", label: "is more than" },
    { id: "less_than", label: "is less than" },
    { id: "exists", label: "is set" },
    { id: "not_exists", label: "is not set" },
  ];

  const needsKey = (field: string) => ["custom_field", "variable"].includes(field);
  const needsValue = (operator: string) =>
    !["is_true", "is_false", "exists", "not_exists"].includes(operator);

  return (
    <div className="space-y-2">
      {conditions.map((condition, i) => (
        <div key={i} className="space-y-1.5 rounded-xl border border-[var(--border)] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-faint)]">Condition {i + 1}</span>
            {conditions.length > 1 && (
              <button
                onClick={() => onChange(conditions.filter((_, j) => j !== i))}
                className="text-[var(--text-faint)] hover:text-red-400"
                aria-label="Remove condition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select
            value={condition.field}
            onChange={(e) => {
              const next = [...conditions];
              next[i] = { ...condition, field: e.target.value };
              onChange(next);
            }}
          >
            {FIELDS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
          {needsKey(condition.field) && (
            <Input
              value={condition.key ?? ""}
              onChange={(e) => {
                const next = [...conditions];
                next[i] = { ...condition, key: e.target.value };
                onChange(next);
              }}
              placeholder="Field name"
            />
          )}
          <Select
            value={condition.operator}
            onChange={(e) => {
              const next = [...conditions];
              next[i] = { ...condition, operator: e.target.value };
              onChange(next);
            }}
          >
            {OPERATORS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          {needsValue(condition.operator) && (
            <Input
              value={condition.value ?? ""}
              onChange={(e) => {
                const next = [...conditions];
                next[i] = { ...condition, value: e.target.value };
                onChange(next);
              }}
              placeholder="Value"
            />
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange([...conditions, { field: "has_tag", operator: "equals", value: "" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add a condition
      </Button>
    </div>
  );
}
