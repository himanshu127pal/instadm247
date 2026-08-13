"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Plus, Ticket, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { CopyField, SectionCard } from "@/components/dashboard/bits";

export type Pool = {
  id: string;
  name: string;
  mode: string;
  sharedCode: string | null;
  description: string | null;
  expiresAt: string | null;
  stats: { total: number; issued: number; remaining: number };
};

export function CouponsTab({ pools }: { pools: Pool[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  async function remove(pool: Pool) {
    if (!confirm(`Delete "${pool.name}"? Issued codes stop being tracked.`)) return;
    const res = await fetch("/api/coupons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pool.id }),
    });
    if (res.ok) {
      toast.success("Pool deleted");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="gradient" onClick={() => setCreating((v) => !v)}>
        <Plus className="h-4 w-4" />
        New coupon pool
      </Button>

      {creating && <PoolComposer onDone={() => setCreating(false)} />}

      {pools.length === 0 ? (
        <EmptyState
          icon={<Ticket />}
          title="No coupon pools yet"
          description="Create a pool, then drop a 'Send a coupon' step into any flow. Each person gets at most one code."
        />
      ) : (
        <div className="space-y-3">
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} onDelete={() => remove(pool)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PoolCard({ pool, onDelete }: { pool: Pool; onDelete: () => void }) {
  const router = useRouter();
  const [topUp, setTopUp] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const low = pool.mode === "UNIQUE" && pool.stats.remaining <= 10;
  const expired = pool.expiresAt && new Date(pool.expiresAt) < new Date();

  async function addMore() {
    if (!topUp.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pool.id, codes: topUp }),
      });
      const data = (await res.json()) as { added?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add codes");
      toast.success(`Added ${data.added ?? 0} codes`);
      setTopUp("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-extrabold">{pool.name}</p>
            <Badge tone={pool.mode === "UNIQUE" ? "brand" : "info"}>
              {pool.mode === "UNIQUE" ? "One code each" : "Shared code"}
            </Badge>
            {expired && <Badge tone="danger">Expired</Badge>}
            {low && !expired && (
              <Badge tone="warning">
                <AlertTriangle className="h-3 w-3" />
                Running low
              </Badge>
            )}
          </div>

          {pool.description && (
            <p className="mt-1 text-[12.5px] font-medium text-[var(--text-muted)]">
              {pool.description}
            </p>
          )}

          {pool.mode === "UNIQUE" ? (
            <p className="mt-2 text-[12.5px] font-bold text-[var(--text-muted)]">
              {pool.stats.issued.toLocaleString()} issued ·{" "}
              <span className={low ? "text-[var(--color-zap-500)]" : undefined}>
                {pool.stats.remaining.toLocaleString()} left
              </span>{" "}
              of {pool.stats.total.toLocaleString()}
            </p>
          ) : (
            <p className="mt-2 font-mono text-[13px] font-bold">{pool.sharedCode}</p>
          )}

          <div className="mt-3 max-w-xs">
            <CopyField label="Pool ID — paste into a coupon step" value={pool.id} />
          </div>
        </div>

        <Button variant="ghost" size="icon" aria-label="Delete pool" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {pool.mode === "UNIQUE" && (
        <div className="mt-4 space-y-2 border-t-2 border-[var(--border-soft)] pt-3">
          <Textarea
            value={topUp}
            onChange={(e) => setTopUp(e.target.value)}
            placeholder="Paste more codes — one per line, or comma separated"
            className="min-h-[64px] font-mono text-[12px]"
          />
          <Button variant="secondary" size="sm" onClick={addMore} loading={adding}>
            <Plus className="h-3.5 w-3.5" /> Add codes
          </Button>
        </div>
      )}
    </article>
  );
}

function PoolComposer({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [mode, setMode] = React.useState<"UNIQUE" | "SHARED">("UNIQUE");
  const [sharedCode, setSharedCode] = React.useState("");
  const [source, setSource] = React.useState<"generate" | "paste">("generate");
  const [prefix, setPrefix] = React.useState("SAVE20");
  const [count, setCount] = React.useState(200);
  const [codes, setCodes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Give the pool a name.");
      return;
    }
    if (mode === "SHARED" && !sharedCode.trim()) {
      toast.error("A shared pool needs the code everyone gets.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          mode,
          sharedCode: mode === "SHARED" ? sharedCode.trim() : undefined,
          ...(mode === "UNIQUE"
            ? source === "generate"
              ? { generate: { prefix: prefix.trim(), count } }
              : { codes }
            : {}),
        }),
      });
      const data = (await res.json()) as { added?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create the pool");

      toast.success(
        mode === "UNIQUE" ? `Pool created with ${data.added ?? 0} codes` : "Pool created",
      );
      onDone();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="New coupon pool">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Spring launch — 20% off"
            />
          </Field>
          <Field label="Type">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="UNIQUE">One unique code per person</option>
              <option value="SHARED">One shared code for everyone</option>
            </Select>
          </Field>
        </div>

        {mode === "SHARED" ? (
          <Field label="The code" hint="Everyone who reaches the coupon step gets this.">
            <Input
              value={sharedCode}
              onChange={(e) => setSharedCode(e.target.value.toUpperCase())}
              placeholder="SPRING20"
              className="font-mono"
            />
          </Field>
        ) : (
          <>
            <div className="flex gap-1 rounded-xl border-2 border-[var(--border)] p-1">
              {(
                [
                  { id: "generate", label: "Generate codes" },
                  { id: "paste", label: "Paste my own" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSource(option.id)}
                  className={
                    source === option.id
                      ? "flex-1 rounded-lg bg-[var(--color-pow-400)] px-2 py-1.5 text-[12px] font-extrabold text-[#12110e]"
                      : "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-bold text-[var(--text-muted)]"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>

            {source === "generate" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prefix" hint="Codes look like PREFIX-A7K2QX.">
                  <Input
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder="SAVE20"
                    className="font-mono"
                  />
                </Field>
                <Field label="How many">
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value) || 100)}
                  />
                </Field>
              </div>
            ) : (
              <Field
                label="Your codes"
                hint="One per line, or comma separated. Duplicates are ignored."
              >
                <Textarea
                  value={codes}
                  onChange={(e) => setCodes(e.target.value)}
                  placeholder={"SPRING-001\nSPRING-002\nSPRING-003"}
                  className="min-h-[140px] font-mono text-[12px]"
                />
              </Field>
            )}
          </>
        )}

        <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 text-[12.5px] font-medium leading-relaxed text-[var(--text-muted)]">
          A person can only ever be issued one code from a pool — if a flow runs
          again for them, they get the same code back rather than burning another.
        </p>

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} loading={saving}>
            Create pool
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
