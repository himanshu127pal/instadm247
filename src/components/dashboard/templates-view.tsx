"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, MessageSquare, MousePointerClick, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { CopyField, SectionCard, Tabs } from "@/components/dashboard/bits";
import { previewTemplate } from "@/lib/engine/template";
import { CouponsTab, type Pool } from "@/components/dashboard/coupons-tab";
import { MenuTab, type MenuItem } from "@/components/dashboard/menu-tab";
import { timeAgo } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  category: string;
  payload: { kind: string; text?: string };
  updatedAt: string;
};
type TrackedLink = {
  id: string;
  code: string;
  destination: string;
  label: string | null;
  clickCount: number;
};
type IceBreaker = {
  id: string;
  accountId: string;
  accountUsername: string;
  question: string;
  order: number;
};

export function TemplatesView({
  appUrl,
  accounts,
  templates,
  links,
  pools,
  menus,
  iceBreakers,
}: {
  appUrl: string;
  accounts: Array<{ id: string; username: string }>;
  templates: Template[];
  links: TrackedLink[];
  pools: Pool[];
  menus: Array<{ accountId: string; enabled: boolean; items: MenuItem[] }>;
  iceBreakers: IceBreaker[];
}) {
  const [tab, setTab] = React.useState("templates");

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { id: "templates", label: "Messages", count: templates.length },
          { id: "links", label: "Tracked links", count: links.length },
          { id: "coupons", label: "Coupons", count: pools.length },
          { id: "menu", label: "DM main menu" },
          { id: "starters", label: "Conversation starters", count: iceBreakers.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "templates" && <TemplatesTab templates={templates} />}
      {tab === "links" && <LinksTab links={links} appUrl={appUrl} />}
      {tab === "coupons" && <CouponsTab pools={pools} />}
      {tab === "menu" && <MenuTab accounts={accounts} menus={menus} />}
      {tab === "starters" && <StartersTab accounts={accounts} iceBreakers={iceBreakers} />}
    </div>
  );
}

function TemplatesTab({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("general");
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!name.trim() || !text.trim()) {
      toast.error("A name and some message text are needed.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "template",
          name: name.trim(),
          category,
          payload: { kind: "text", text },
        }),
      });
      if (!res.ok) throw new Error("Could not save the template");
      toast.success("Template saved");
      setCreating(false);
      setName("");
      setText("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch("/api/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "template", id }),
    });
    if (res.ok) {
      toast.success("Template deleted");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="gradient" onClick={() => setCreating((v) => !v)}>
        <Plus className="h-4 w-4" />
        New template
      </Button>

      {creating && (
        <SectionCard title="New template">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Shipping answer"
                />
              </Field>
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {["general", "sales", "support", "welcome", "follow-up"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Message" hint="Supports {{first_name}} and your other tokens.">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Hey {{first_name}}! We ship worldwide — UK in 2–3 days, EU in 5–7 🌍"
              />
            </Field>
            {text && (
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3">
                <p className="mb-1 text-[10.5px] uppercase tracking-wider text-[var(--text-faint)]">
                  Preview
                </p>
                <p className="text-[13px] leading-relaxed">{previewTemplate(text)}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={save} loading={saving}>
                Save template
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {templates.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="No templates yet"
          description="Save the replies you send over and over, then drop them into any flow."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <article
              key={template.id}
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{template.name}</p>
                  <Badge className="mt-1">{template.category}</Badge>
                </div>
                <button
                  onClick={() => remove(template.id)}
                  className="shrink-0 text-[var(--text-faint)] hover:text-[var(--color-zap-500)]"
                  aria-label="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2.5 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                {template.payload.text ?? `[${template.payload.kind}]`}
              </p>
              <p className="mt-2 text-[11px] text-[var(--text-faint)]">
                Updated {timeAgo(template.updatedAt)}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function LinksTab({ links, appUrl }: { links: TrackedLink[]; appUrl: string }) {
  const router = useRouter();
  const [destination, setDestination] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function create() {
    if (!destination.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "link",
          destination: destination.trim(),
          label: label.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That doesn't look like a valid URL");
      toast.success("Tracked link created");
      setDestination("");
      setLabel("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch("/api/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "link", id }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Create a tracked link"
        description="Use these in your DM buttons and every click shows up in analytics."
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Destination">
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="https://yourshop.com/spring"
              />
            </Field>
            <Field label="Label" hint="Optional.">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Spring collection"
              />
            </Field>
          </div>
          <Button variant="primary" onClick={create} loading={saving}>
            <Plus className="h-4 w-4" /> Create link
          </Button>
        </div>
      </SectionCard>

      {links.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title="No tracked links yet"
          description="A tracked link works like any other URL — it just records the click on its way through."
        />
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <article
              key={link.id}
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{link.label ?? "Tracked link"}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                    → {link.destination}
                  </p>
                  <div className="mt-2.5 max-w-md">
                    <CopyField value={`${appUrl}/r/${link.code}`} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-[var(--text-faint)]">
                      <MousePointerClick className="h-3 w-3" /> Clicks
                    </p>
                    <p className="text-[18px] font-semibold tabular-nums">
                      {link.clickCount.toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(link.id)}
                    className="text-[var(--text-faint)] hover:text-[var(--color-zap-500)]"
                    aria-label="Delete link"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StartersTab({
  accounts,
  iceBreakers,
}: {
  accounts: Array<{ id: string; username: string }>;
  iceBreakers: IceBreaker[];
}) {
  const router = useRouter();
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const existing = iceBreakers.filter((i) => i.accountId === accountId);
  const [questions, setQuestions] = React.useState<string[]>(
    existing.length ? existing.map((i) => i.question) : [""],
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const current = iceBreakers.filter((i) => i.accountId === accountId).map((i) => i.question);
    setQuestions(current.length ? current : [""]);
  }, [accountId, iceBreakers]);

  async function save() {
    const cleaned = questions.map((q) => q.trim()).filter(Boolean);
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "icebreakers", accountId, questions: cleaned }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      toast.success("Conversation starters saved");
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
        icon={<MessageSquare />}
        title="Connect an account first"
        description="Conversation starters appear in your Instagram inbox, so they belong to a specific account."
      />
    );
  }

  return (
    <SectionCard
      title="Conversation starters"
      description="These appear as tappable prompts when someone opens your Instagram inbox. You can set up to 5; Instagram shows 4."
    >
      <div className="space-y-4">
        {accounts.length > 1 && (
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  @{account.username}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="space-y-2">
          {questions.map((question, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0 text-[12px] text-[var(--text-faint)]">{i + 1}.</span>
              <Input
                value={question}
                maxLength={80}
                onChange={(e) => {
                  const next = [...questions];
                  next[i] = e.target.value;
                  setQuestions(next);
                }}
                placeholder="Where do you ship to?"
              />
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-faint)]">
                {question.length}/80
              </span>
              {questions.length > 1 && (
                <button
                  onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                  className="shrink-0 text-[var(--text-faint)] hover:text-[var(--color-zap-500)]"
                  aria-label="Remove starter"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {questions.length < 5 && (
            <Button variant="secondary" size="sm" onClick={() => setQuestions([...questions, ""])}>
              <Plus className="h-3.5 w-3.5" /> Add a starter
            </Button>
          )}
        </div>

        <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          To answer a starter automatically, create an automation with the{" "}
          <strong className="text-[var(--text)]">Conversation starter tapped</strong> trigger.
        </p>

        <Button variant="primary" onClick={save} loading={saving}>
          Save and publish to Instagram
        </Button>
      </div>
    </SectionCard>
  );
}
