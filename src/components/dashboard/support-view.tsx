"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lightbulb, Send } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; ticket?: { id: string } };
  if (!res.ok) throw new Error(data.error ?? "That didn't go through. Please try again.");
  return data;
}

/** Open a ticket. */
export function NewTicketForm({ categories, onDone }: { categories: Record<string, string>; onDone?: () => void }) {
  const router = useRouter();
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("automations");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      const data = await send("/api/support", "POST", { subject, category, body });
      toast.success("Ticket sent. We'll email you when we reply.");
      onDone?.();
      router.push(`/dashboard/support/${data.ticket!.id}`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="New ticket">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="For example: replies to story mentions aren't sending" />
          </Field>
          <Field label="About">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="What's happening?" hint="What you tried, what you expected, and what happened instead. Which automation or contact, if it's about one.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} className="min-h-[140px]" />
        </Field>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={submit} loading={busy} disabled={subject.trim().length < 3 || body.trim().length < 10}>
            <Send className="h-4 w-4" /> Send ticket
          </Button>
          {onDone && (
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function NewTicketToggle({ categories, startOpen }: { categories: Record<string, string>; startOpen: boolean }) {
  const [open, setOpen] = React.useState(startOpen);
  if (open) return <NewTicketForm categories={categories} onDone={startOpen ? undefined : () => setOpen(false)} />;
  return (
    <Button variant="gradient" onClick={() => setOpen(true)}>
      New ticket
    </Button>
  );
}

/** Reply on a ticket, or close/reopen it. */
export function TicketReply({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function reply() {
    setBusy(true);
    try {
      await send(`/api/support/${ticketId}`, "POST", { body });
      setBody("");
      toast.success("Sent");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "open" | "closed") {
    try {
      await send(`/api/support/${ticketId}`, "PATCH", { status });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder={closed ? "Write to reopen this ticket" : "Write a reply"} className="min-h-[100px]" />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={reply} loading={busy} disabled={!body.trim()}>
          <Send className="h-4 w-4" /> {closed ? "Reply and reopen" : "Reply"}
        </Button>
        {closed ? (
          <Button variant="ghost" onClick={() => setStatus("open")}>Reopen</Button>
        ) : (
          <Button variant="ghost" onClick={() => setStatus("closed")}>Close ticket</Button>
        )}
      </div>
    </div>
  );
}

/** Request a feature. */
export function FeatureRequestForm({ areas }: { areas: Record<string, string> }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [area, setArea] = React.useState("automations");
  const [problem, setProblem] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await send("/api/requests", "POST", { title, area, problem, outcome: outcome || undefined });
      toast.success("Thanks! We read every request.");
      setTitle("");
      setProblem("");
      setOutcome("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="What should InstaDM247 help you do?">
      <div className="space-y-4">
        <p className="-mt-1 flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <Lightbulb className="h-4 w-4 shrink-0" /> Describe the problem and the result you need. You don&rsquo;t have to design the solution.
        </p>
        <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
          <Field label="Short title">
            <div className="relative">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="For example: pause replies outside business hours" className="pr-14" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-faint)]">{title.length}/100</span>
            </div>
          </Field>
          <Field label="Area">
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              {Object.entries(areas).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What problem are you running into?">
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={4000} placeholder="What you're trying to do and where it breaks down." className="min-h-[120px]" />
          </Field>
          <Field label="What would a good outcome look like?" hint="Optional.">
            <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={4000} placeholder="The result you want." className="min-h-[120px]" />
          </Field>
        </div>
        <Button variant="primary" onClick={submit} loading={busy} disabled={title.trim().length < 3 || problem.trim().length < 10}>
          <Send className="h-4 w-4" /> Submit request
        </Button>
      </div>
    </SectionCard>
  );
}
