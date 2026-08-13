"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Key, Plug, Plus, Trash2, Webhook } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select } from "@/components/ui";
import { CopyField, SectionCard, Tabs } from "@/components/dashboard/bits";
import { timeAgo } from "@/lib/utils";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastStatus: number | null;
  lastFiredAt: string | null;
};

type Integration = {
  id: string;
  provider: string;
  name: string;
  targetName: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
};

const WEBHOOK_EVENTS = [
  "contact.created",
  "lead.captured",
  "flow.completed",
  "message.sent",
  "message.failed",
];

export function DevelopersView({
  appUrl,
  keys,
  endpoints,
  integrations,
}: {
  appUrl: string;
  keys: ApiKeyRow[];
  endpoints: Endpoint[];
  integrations: Integration[];
}) {
  const [tab, setTab] = React.useState("keys");

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { id: "keys", label: "API keys", count: keys.filter((k) => !k.revokedAt).length },
          { id: "webhooks", label: "Webhooks", count: endpoints.length },
          { id: "integrations", label: "Integrations", count: integrations.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "keys" && <KeysTab appUrl={appUrl} keys={keys} />}
      {tab === "webhooks" && <WebhooksTab endpoints={endpoints} />}
      {tab === "integrations" && <IntegrationsTab integrations={integrations} />}
    </div>
  );
}

function KeysTab({ appUrl, keys }: { appUrl: string; keys: ApiKeyRow[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["read"]);
  const [creating, setCreating] = React.useState(false);
  const [freshKey, setFreshKey] = React.useState<string | null>(null);

  async function create() {
    if (!name.trim()) {
      toast.error("Give the key a name so you know what it's for.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "key", name: name.trim(), scopes }),
      });
      const data = (await res.json()) as { key?: string; error?: string };
      if (!res.ok || !data.key) throw new Error(data.error ?? "Could not create the key");

      setFreshKey(data.key);
      setName("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Anything using it stops working immediately.")) return;
    const res = await fetch("/api/developers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "key", id }),
    });
    if (res.ok) {
      toast.success("Key revoked");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {freshKey && (
        <SectionCard title="Copy this key now">
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border-2 border-[var(--border)] bg-[var(--color-pow-400)]/40 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-[13px] font-bold leading-relaxed">
                This is the only time you&rsquo;ll see it. We store a hash, not the key —
                if you lose it, create a new one.
              </p>
            </div>
            <CopyField value={freshKey} />
            <Button variant="secondary" size="sm" onClick={() => setFreshKey(null)}>
              I&rsquo;ve saved it
            </Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Create a key">
        <div className="space-y-4">
          <Field label="Name" hint="What will use this key?">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Zapier connection"
            />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-extrabold">Scopes</p>
            <div className="flex gap-1.5">
              {["read", "write"].map((scope) => {
                const on = scopes.includes(scope);
                return (
                  <button
                    key={scope}
                    onClick={() =>
                      setScopes(
                        on
                          ? scopes.filter((s) => s !== scope)
                          : [...scopes, scope],
                      )
                    }
                    className={
                      on
                        ? "rounded-lg border-2 border-[var(--border)] bg-[var(--color-pow-400)] px-3 py-1 text-[12px] font-extrabold text-[#12110e]"
                        : "rounded-lg border-2 border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-1 text-[12px] font-bold"
                    }
                  >
                    {scope}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] font-medium text-[var(--text-muted)]">
              <strong>read</strong> lists contacts · <strong>write</strong> also sends DMs.
              Sends still obey the messaging window and rate limits.
            </p>
          </div>
          <Button variant="primary" onClick={create} loading={creating}>
            <Plus className="h-4 w-4" /> Create key
          </Button>
        </div>
      </SectionCard>

      {keys.length === 0 ? (
        <EmptyState
          icon={<Key />}
          title="No API keys yet"
          description="Create one to read your contacts or send DMs from your own systems."
        />
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-extrabold">{key.name}</p>
                  {key.revokedAt ? (
                    <Badge tone="danger">Revoked</Badge>
                  ) : (
                    key.scopes.map((s) => (
                      <Badge key={s} tone="brand">
                        {s}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="mt-1 font-mono text-[12px] text-[var(--text-muted)]">
                  {key.prefix}••••••••
                </p>
                <p className="mt-0.5 text-[11.5px] font-medium text-[var(--text-faint)]">
                  {key.lastUsedAt ? `Last used ${timeAgo(key.lastUsedAt)}` : "Never used"} ·
                  created {timeAgo(key.createdAt)}
                </p>
              </div>
              {!key.revokedAt && (
                <Button variant="ghost" size="sm" onClick={() => revoke(key.id)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <SectionCard title="Using the API">
        <div className="space-y-3">
          <p className="text-[13px] font-medium leading-relaxed text-[var(--text-muted)]">
            Send your key as a bearer token. Everything is scoped to your workspace, and
            sends go through the same safety guards as the rest of the product.
          </p>
          <pre className="overflow-x-auto rounded-xl border-2 border-[var(--border)] bg-[var(--bg-sunken)] p-3 font-mono text-[11.5px] leading-relaxed">
{`# List reachable contacts
curl ${appUrl}/api/v1/contacts?reachable=true \\
  -H "Authorization: Bearer idm_live_..."

# Send a DM
curl -X POST ${appUrl}/api/v1/send \\
  -H "Authorization: Bearer idm_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"contact_id":"...","text":"Hey!"}'`}
          </pre>
          <p className="text-[12px] font-medium text-[var(--text-muted)]">
            A send that would break Instagram&rsquo;s rules returns{" "}
            <strong>409</strong> with the reason — the window being closed, an opt-out, or
            a rate limit — rather than failing silently.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function WebhooksTab({ endpoints }: { endpoints: Endpoint[] }) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [events, setEvents] = React.useState<string[]>(["lead.captured"]);
  const [saving, setSaving] = React.useState(false);

  async function create() {
    if (!url.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "webhook", url: url.trim(), events }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add the endpoint");
      toast.success("Webhook added");
      setUrl("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch("/api/developers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "webhook", id }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Add an endpoint">
        <div className="space-y-4">
          <Field label="URL">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.yourapp.com/instadm"
            />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-extrabold">Events</p>
            <div className="flex flex-wrap gap-1.5">
              {WEBHOOK_EVENTS.map((event) => {
                const on = events.includes(event);
                return (
                  <button
                    key={event}
                    onClick={() =>
                      setEvents(on ? events.filter((e) => e !== event) : [...events, event])
                    }
                    className={
                      on
                        ? "rounded-lg border-2 border-[var(--border)] bg-[var(--color-pow-400)] px-2.5 py-1 font-mono text-[11.5px] font-bold text-[#12110e]"
                        : "rounded-lg border-2 border-[var(--border)] bg-[var(--bg-sunken)] px-2.5 py-1 font-mono text-[11.5px] font-bold"
                    }
                  >
                    {event}
                  </button>
                );
              })}
            </div>
          </div>
          <Button variant="primary" onClick={create} loading={saving}>
            <Plus className="h-4 w-4" /> Add endpoint
          </Button>
        </div>
      </SectionCard>

      {endpoints.length === 0 ? (
        <EmptyState
          icon={<Webhook />}
          title="No endpoints"
          description="Get a POST to your own server whenever something happens here."
        />
      ) : (
        <div className="space-y-2">
          {endpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[13px] font-bold">{endpoint.url}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {endpoint.events.map((e) => (
                    <Badge key={e}>{e}</Badge>
                  ))}
                </div>
                {endpoint.lastFiredAt && (
                  <p className="mt-1 text-[11.5px] font-medium text-[var(--text-faint)]">
                    Last fired {timeAgo(endpoint.lastFiredAt)}
                    {endpoint.lastStatus ? ` · HTTP ${endpoint.lastStatus}` : ""}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete endpoint"
                onClick={() => remove(endpoint.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationsTab({ integrations }: { integrations: Integration[] }) {
  const router = useRouter();
  const [provider, setProvider] = React.useState("kit");
  const [apiKey, setApiKey] = React.useState("");
  const [targetId, setTargetId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function connect() {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "integration",
          provider,
          name: provider === "kit" ? "Kit" : "Flodesk",
          apiKey: apiKey.trim(),
          targetId: targetId.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not connect");
      toast.success("Connected");
      setApiKey("");
      setTargetId("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch("/api/developers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "integration", id }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Connect an email tool"
        description="Every email captured by a lead form gets forwarded automatically."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider">
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="kit">Kit (ConvertKit)</option>
                <option value="flodesk">Flodesk</option>
              </Select>
            </Field>
            <Field
              label={provider === "kit" ? "Form ID" : "Segment ID"}
              hint="Optional for Flodesk."
            >
              <Input
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={provider === "kit" ? "1234567" : "seg_abc123"}
              />
            </Field>
          </div>
          <Field label="API key" hint="Verified before it's saved, and encrypted at rest.">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••"
            />
          </Field>
          <Button variant="primary" onClick={connect} loading={saving}>
            <Plug className="h-4 w-4" /> Connect
          </Button>
        </div>
      </SectionCard>

      {integrations.length === 0 ? (
        <EmptyState
          icon={<Plug />}
          title="Nothing connected"
          description="Connect Kit or Flodesk and captured emails land in your list automatically."
        />
      ) : (
        <div className="space-y-2">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-extrabold">{integration.name}</p>
                  <Badge tone={integration.enabled ? "success" : "neutral"}>
                    {integration.enabled ? "Active" : "Off"}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] font-medium text-[var(--text-muted)]">
                  {integration.targetName ?? "Default target"}
                  {integration.lastSyncAt && ` · last sync ${timeAgo(integration.lastSyncAt)}`}
                </p>
                {integration.lastError && (
                  <p className="mt-1 text-[12px] font-bold text-[var(--color-zap-500)]">
                    {integration.lastError}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Disconnect"
                onClick={() => remove(integration.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
