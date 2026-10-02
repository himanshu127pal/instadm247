"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Select, Textarea } from "@/components/ui";

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save that.");
}

/** Staff reply on a ticket (the customer is emailed) and status control. */
export function StaffTicketActions({ ticketId, status, statuses }: { ticketId: string; status: string; statuses: Record<string, string> }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder="Reply to the customer. They're emailed it." className="min-h-[120px]" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          loading={busy}
          disabled={!body.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await call(`/api/admin/support/${ticketId}`, "POST", { body });
              setBody("");
              toast.success("Reply sent");
              router.refresh();
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send reply
        </Button>
        <Select
          className="w-auto"
          value={status}
          onChange={async (e) => {
            try {
              await call(`/api/admin/support/${ticketId}`, "PATCH", { status: e.target.value });
              router.refresh();
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          {Object.entries(statuses).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** Set a feature request's status and the note the customer sees. */
export function RequestControls({ id, status, note, statuses }: { id: string; status: string; note: string | null; statuses: Record<string, string> }) {
  const router = useRouter();
  const [next, setNext] = React.useState(status);
  const [text, setText] = React.useState(note ?? "");
  const [busy, setBusy] = React.useState(false);
  const dirty = next !== status || (text.trim() || null) !== note;
  return (
    <div className="space-y-2">
      <Select value={next} onChange={(e) => setNext(e.target.value)} className="w-auto">
        {Object.entries(statuses).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Note for the customer (optional). They see it on their request." className="min-h-[70px]" />
      <Button
        size="sm"
        variant="primary"
        loading={busy}
        disabled={!dirty}
        onClick={async () => {
          setBusy(true);
          try {
            await call(`/api/admin/requests/${id}`, "PATCH", { status: next, staffNote: text.trim() || null });
            toast.success("Saved. The customer is emailed about the change.");
            router.refresh();
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save and notify
      </Button>
    </div>
  );
}
