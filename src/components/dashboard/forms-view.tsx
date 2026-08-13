"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Download, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select, Switch } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { timeAgo } from "@/lib/utils";

type FormField = { id: string; label: string; type: string; required?: boolean; options?: string[] };

type LeadForm = {
  id: string;
  name: string;
  kind: string;
  fields: FormField[];
  successMessage: string | null;
  responseCount: number;
  completedCount: number;
  createdAt: string;
};

export function FormsView({ forms }: { forms: LeadForm[] }) {
  const [editing, setEditing] = React.useState<LeadForm | "new" | null>(null);

  return (
    <div className="space-y-5">
      <Button variant="gradient" onClick={() => setEditing("new")}>
        <Plus className="h-4 w-4" />
        New form
      </Button>

      {editing && (
        <FormEditor
          form={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {forms.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No forms yet"
          description="Build a form, then drop an 'Ask a question' step into any flow and point it at the form."
        />
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <article
              key={form.id}
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold">{form.name}</p>
                    <Badge tone="brand">{form.kind.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
                    {form.fields.length} question{form.fields.length === 1 ? "" : "s"} ·{" "}
                    {form.completedCount.toLocaleString()} completed of{" "}
                    {form.responseCount.toLocaleString()} started · created{" "}
                    {timeAgo(form.createdAt)}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {form.fields.map((field) => (
                      <Badge key={field.id}>{field.label}</Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {form.responseCount > 0 && (
                    <a href={`/api/forms/${form.id}/export`} download>
                      <Button variant="secondary" size="sm">
                        <Download className="h-3.5 w-3.5" />
                        CSV
                      </Button>
                    </a>
                  )}
                  {form.responseCount > 0 && (
                    <a href={`/api/forms/${form.id}/export?format=xlsx`} download>
                      <Button variant="secondary" size="sm">
                        <Download className="h-3.5 w-3.5" />
                        Excel
                      </Button>
                    </a>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(form)}>
                    Edit
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function FormEditor({ form, onDone }: { form: LeadForm | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState(form?.name ?? "");
  const [kind, setKind] = React.useState(form?.kind ?? "FORM");
  const [successMessage, setSuccessMessage] = React.useState(form?.successMessage ?? "");
  const [fields, setFields] = React.useState<FormField[]>(
    form?.fields.length
      ? form.fields
      : [{ id: "email", label: "Email address", type: "email", required: true }],
  );
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Give the form a name.");
      return;
    }
    if (fields.some((f) => !f.id.trim() || !f.label.trim())) {
      toast.error("Every question needs a label and a field name.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form?.id,
          name: name.trim(),
          kind,
          fields: fields.map((f) => ({ ...f, required: f.required ?? true })),
          successMessage: successMessage.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the form");

      toast.success("Form saved");
      onDone();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form) return onDone();
    if (!confirm(`Delete "${form.name}"? Its responses go too.`)) return;

    const res = await fetch("/api/forms", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: form.id }),
    });
    if (res.ok) {
      toast.success("Form deleted");
      onDone();
      router.refresh();
    }
  }

  return (
    <SectionCard title={form ? "Edit form" : "New form"}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Waitlist signup"
            />
          </Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="FORM">Form</option>
              <option value="SURVEY">Survey</option>
              <option value="QUIZ">Quiz</option>
              <option value="ORDER">Order</option>
            </Select>
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium">Questions</p>
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-faint)]">Question {i + 1}</span>
                  {fields.length > 1 && (
                    <button
                      onClick={() => setFields(fields.filter((_, j) => j !== i))}
                      className="text-[var(--text-faint)] hover:text-red-400"
                      aria-label="Remove question"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <Input
                  value={field.label}
                  onChange={(e) => {
                    const next = [...fields];
                    next[i] = { ...field, label: e.target.value };
                    setFields(next);
                  }}
                  placeholder="What should we ask?"
                />

                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={field.id}
                    onChange={(e) => {
                      const next = [...fields];
                      next[i] = {
                        ...field,
                        id: e.target.value.replace(/[^\w]/g, "_").toLowerCase(),
                      };
                      setFields(next);
                    }}
                    placeholder="field_name"
                  />
                  <Select
                    value={field.type}
                    onChange={(e) => {
                      const next = [...fields];
                      next[i] = { ...field, type: e.target.value };
                      setFields(next);
                    }}
                  >
                    {["text", "email", "phone", "number", "choice", "rating"].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>

                {field.type === "choice" && (
                  <Input
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) => {
                      const next = [...fields];
                      next[i] = {
                        ...field,
                        options: e.target.value
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean),
                      };
                      setFields(next);
                    }}
                    placeholder="Option A, Option B, Option C"
                  />
                )}

                <label className="flex items-center gap-2.5">
                  <Switch
                    checked={field.required ?? true}
                    onCheckedChange={(v) => {
                      const next = [...fields];
                      next[i] = { ...field, required: v };
                      setFields(next);
                    }}
                    label="Required"
                  />
                  <span className="text-[12.5px] text-[var(--text-muted)]">Required</span>
                </label>
              </div>
            ))}

            {fields.length < 20 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setFields([
                    ...fields,
                    { id: `field_${fields.length + 1}`, label: "", type: "text", required: true },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add a question
              </Button>
            )}
          </div>
        </div>

        <Field label="Message after they finish" hint="Optional.">
          <Input
            value={successMessage}
            onChange={(e) => setSuccessMessage(e.target.value)}
            placeholder="All done — check your inbox in a minute 🎉"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={save} loading={saving}>
            Save form
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          {form && (
            <Button variant="ghost" className="ml-auto text-red-400" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
