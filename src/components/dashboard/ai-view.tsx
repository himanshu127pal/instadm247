"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, BookOpen, Bot, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { timeAgo } from "@/lib/utils";

type Agent = {
  id: string;
  name: string;
  enabled: boolean;
  persona: string;
  tone: string;
  language: string;
  maxTurns: number;
  bannedTopics: string[];
  fallbackMessage: string;
  handoffOnUnknown: boolean;
  model: string;
};

type Doc = { id: string; title: string; content: string; createdAt: string };

export function AiAgentView({
  agent: initial,
  docs,
  modelConfigured,
}: {
  agent: Agent;
  docs: Doc[];
  modelConfigured: boolean;
}) {
  const router = useRouter();
  const [agent, setAgent] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [editingDoc, setEditingDoc] = React.useState<Doc | "new" | null>(null);

  function patch(changes: Partial<Agent>) {
    setAgent((current) => ({ ...current, ...changes }));
  }

  async function save(changes: Partial<Agent> = {}) {
    setSaving(true);
    try {
      const res = await fetch("/api/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...agent, ...changes, id: agent.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      toast.success("AI settings saved");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {!modelConfigured && (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-amber-500/25 bg-amber-500/[0.07] p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-[14px] font-medium text-amber-200">No model key configured</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
              Add <code className="font-mono">ANTHROPIC_API_KEY</code> to enable generated
              replies. Until then the AI step falls back to your knowledge base article
              directly, or the fallback message — it never blocks a flow.
            </p>
          </div>
        </div>
      )}

      <SectionCard title="Agent">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
            <span>
              <span className="block text-[13.5px] font-medium">Enable the AI agent</span>
              <span className="block text-[12px] text-[var(--text-muted)]">
                Flows with an AI step will use it. Others are unaffected.
              </span>
            </span>
            <Switch
              checked={agent.enabled}
              onCheckedChange={(v) => {
                patch({ enabled: v });
                void save({ enabled: v });
              }}
              label="Enable AI agent"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={agent.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Tone">
              <Select value={agent.tone} onChange={(e) => patch({ tone: e.target.value })}>
                {["friendly", "professional", "playful", "concise", "warm"].map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Persona" hint="Who is it, and what is it here to do?">
            <Textarea
              value={agent.persona}
              onChange={(e) => patch({ persona: e.target.value })}
              placeholder="You're the assistant for a small ceramics studio. Help people find the right piece and tell them about shipping."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Language">
              <Select value={agent.language} onChange={(e) => patch({ language: e.target.value })}>
                <option value="auto">Match whatever they wrote in</option>
                {["English", "Spanish", "Portuguese", "French", "German", "Hindi", "Arabic"].map(
                  (language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field label="Max replies per conversation" hint="Then it hands over.">
              <Input
                type="number"
                min={1}
                max={20}
                value={agent.maxTurns}
                onChange={(e) => patch({ maxTurns: Number(e.target.value) || 6 })}
              />
            </Field>
          </div>

          <Field
            label="Never discuss"
            hint="Comma separated. Anything matching these goes straight to a human."
          >
            <Input
              value={agent.bannedTopics.join(", ")}
              onChange={(e) =>
                patch({
                  bannedTopics: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="refunds, legal, medical advice"
            />
          </Field>

          <Field label="Fallback message" hint="Sent when it can't ground an answer.">
            <Input
              value={agent.fallbackMessage}
              onChange={(e) => patch({ fallbackMessage: e.target.value })}
            />
          </Field>

          <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3">
            <Switch
              checked={agent.handoffOnUnknown}
              onCheckedChange={(v) => patch({ handoffOnUnknown: v })}
              label="Hand off when unsure"
            />
            <span>
              <span className="block text-[13.5px] font-medium">Hand off when unsure</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--text-muted)]">
                The agent only states facts from your knowledge base. When the answer
                isn&rsquo;t there, this puts the conversation in your inbox instead of
                letting it guess.
              </span>
            </span>
          </label>

          <Button variant="primary" onClick={() => save()} loading={saving}>
            Save agent settings
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Knowledge base"
        description="The only source the agent is allowed to answer from."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setEditingDoc("new")}>
            <Plus className="h-3.5 w-3.5" />
            Add article
          </Button>
        }
      >
        {editingDoc && (
          <div className="mb-4">
            <DocEditor
              doc={editingDoc === "new" ? null : editingDoc}
              onDone={() => setEditingDoc(null)}
            />
          </div>
        )}

        {docs.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="Nothing to answer from yet"
            description="Add your shipping policy, sizing guide, FAQ — anything you'd otherwise retype in DMs."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-sunken)] text-[var(--accent)]">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{doc.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                    {doc.content}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                    Added {timeAgo(doc.createdAt)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingDoc(doc)}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="How the agent behaves">
        <ul className="space-y-2.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
          {[
            "It answers only from the articles above. If the answer isn't there, it says so and hands the conversation to you.",
            "It won't invent prices, stock levels, shipping times or policies — the one thing that turns a helpful bot into a liability.",
            "Its replies go through the same dispatcher as everything else, so the messaging window and rate limits still apply.",
            "Every AI message is labelled in your inbox, so you always know what was said on your behalf.",
          ].map((line, i) => (
            <li key={i} className="flex items-start gap-2">
              <Badge tone="brand" className="mt-0.5 shrink-0">
                <Bot className="h-3 w-3" />
              </Badge>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function DocEditor({ doc, onDone }: { doc: Doc | null; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = React.useState(doc?.title ?? "");
  const [content, setContent] = React.useState(doc?.content ?? "");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!title.trim() || !content.trim()) {
      toast.error("Both a title and some content are needed.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc?.id, title: title.trim(), content: content.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      toast.success("Article saved");
      onDone();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!doc) return onDone();
    const res = await fetch("/api/ai", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: doc.id }),
    });
    if (res.ok) {
      toast.success("Article deleted");
      onDone();
      router.refresh();
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-4">
      <Field label="Title">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Shipping and delivery"
        />
      </Field>
      <Field label="Content" hint="Plain language. Write it the way you'd explain it in a DM.">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="We ship worldwide. UK orders arrive in 2–3 working days, EU in 5–7. Free over £60."
          className="min-h-[140px]"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={save} loading={saving}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        {doc && (
          <Button variant="ghost" size="sm" className="ml-auto text-red-400" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
