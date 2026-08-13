"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { timeAgo } from "@/lib/utils";

type Post = {
  id: string;
  accountUsername: string;
  mediaType: string;
  caption: string | null;
  mediaUrls: string[];
  scheduledAt: string;
  publishedAt: string | null;
  status: string;
  error: string | null;
  attachAutomationIds: string[];
};

export function SchedulerView({
  accounts,
  automations,
  posts,
  configured,
}: {
  accounts: Array<{ id: string; username: string; scopes: string[] }>;
  automations: Array<{ id: string; name: string; accountId: string }>;
  posts: Post[];
  configured: boolean;
}) {
  const [composing, setComposing] = React.useState(false);

  // Publishing needs a permission the messaging features don't.
  const missingScope = accounts.some(
    (a) => a.scopes.length > 0 && !a.scopes.includes("instagram_business_content_publish"),
  );

  return (
    <div className="space-y-5">
      {missingScope && (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)]/40 p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-[14px] font-extrabold">Reconnect to enable publishing</p>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-[var(--text-muted)]">
              Publishing needs the <code className="font-mono">instagram_business_content_publish</code>{" "}
              permission, which one of your accounts was connected without. Reconnect it from
              Instagram accounts and scheduling will work.
            </p>
          </div>
        </div>
      )}

      {accounts.length > 0 && (
        <Button variant="gradient" onClick={() => setComposing((v) => !v)}>
          <Plus className="h-4 w-4" />
          Schedule a post
        </Button>
      )}

      {composing && (
        <Composer
          accounts={accounts}
          automations={automations}
          onDone={() => setComposing(false)}
        />
      )}

      {posts.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Nothing scheduled"
          description={
            configured
              ? "Schedule a post and pick which automation should switch on the moment it publishes."
              : "Connect Instagram first — scheduling publishes through the official content API."
          }
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} automations={automations} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  automations,
}: {
  post: Post;
  automations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const attached = automations.filter((a) => post.attachAutomationIds.includes(a.id));

  async function act(action: "cancel" | "publish_now" | "retry") {
    if (action === "publish_now" && !confirm("Publish this to Instagram right now?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id, action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update this post");
      toast.success(action === "cancel" ? "Cancelled" : "Publishing now");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const res = await fetch("/api/scheduler", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id }),
    });
    if (res.ok) {
      toast.success("Removed");
      router.refresh();
    }
  }

  const tone =
    post.status === "published"
      ? "success"
      : post.status === "failed"
        ? "danger"
        : post.status === "publishing"
          ? "brand"
          : post.status === "cancelled"
            ? "neutral"
            : "info";

  return (
    <article className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]">
      <div className="flex flex-wrap items-start gap-4">
        {post.mediaUrls[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.mediaUrls[0]}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg border-2 border-[var(--border)] object-cover"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{post.status}</Badge>
            <Badge>{post.mediaType.toLowerCase()}</Badge>
            <span className="text-[12.5px] font-bold text-[var(--text-muted)]">
              @{post.accountUsername}
            </span>
          </div>

          <p className="mt-2 line-clamp-2 text-[13.5px] font-semibold">
            {post.caption || <span className="text-[var(--text-faint)]">No caption</span>}
          </p>

          <p className="mt-1 text-[12px] font-bold text-[var(--text-muted)]">
            {post.publishedAt
              ? `Published ${timeAgo(post.publishedAt)}`
              : `Scheduled for ${new Date(post.scheduledAt).toLocaleString()}`}
          </p>

          {attached.length > 0 && (
            <p className="mt-1.5 text-[12px] font-medium text-[var(--text-muted)]">
              Switches on: {attached.map((a) => a.name).join(", ")}
            </p>
          )}

          {post.error && (
            <p className="mt-2 text-[12.5px] font-bold text-[var(--color-zap-500)]">
              {post.error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {(post.status === "scheduled" || post.status === "failed") && (
            <Button variant="secondary" size="sm" loading={busy} onClick={() => act("publish_now")}>
              {post.status === "failed" ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {post.status === "failed" ? "Retry" : "Publish now"}
            </Button>
          )}
          {post.status === "scheduled" && (
            <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => act("cancel")}>
              <X className="h-4 w-4" />
            </Button>
          )}
          {post.status !== "publishing" && (
            <Button variant="ghost" size="icon" aria-label="Delete" onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Composer({
  accounts,
  automations,
  onDone,
}: {
  accounts: Array<{ id: string; username: string }>;
  automations: Array<{ id: string; name: string; accountId: string }>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = React.useState(accounts[0].id);
  const [mediaType, setMediaType] = React.useState("IMAGE");
  const [urls, setUrls] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [when, setWhen] = React.useState(defaultWhen());
  const [attach, setAttach] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const accountAutomations = automations.filter((a) => a.accountId === accountId);
  const mediaUrls = urls
    .split(/[\s,\n]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  async function save() {
    if (mediaUrls.length === 0) {
      toast.error("Add at least one media URL.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          mediaType,
          caption: caption.trim() || undefined,
          mediaUrls,
          scheduledAt: new Date(when).toISOString(),
          attachAutomationIds: attach,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not schedule the post");

      toast.success("Post scheduled");
      onDone();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Schedule a post">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.length > 1 && (
            <Field label="Account">
              <Select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setAttach([]);
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Type">
            <Select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
              <option value="IMAGE">Image</option>
              <option value="REELS">Reel</option>
              <option value="VIDEO">Video</option>
              <option value="CAROUSEL">Carousel</option>
            </Select>
          </Field>
        </div>

        <Field
          label="Media URLs"
          hint="Public HTTPS URLs Instagram can fetch. One per line — a carousel takes up to 10."
        >
          <Textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="https://cdn.example.com/photo.jpg"
            className="min-h-[80px] font-mono text-[12px]"
          />
        </Field>

        <Field label="Caption" hint="Drop a DM Planner draft code in here to link an automation.">
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="New drop is live 🔥 Comment LINK and I'll send it over."
            maxLength={2200}
          />
        </Field>

        <Field label="When">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>

        {accountAutomations.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-extrabold">
              Switch these on when it publishes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {accountAutomations.map((automation) => {
                const on = attach.includes(automation.id);
                return (
                  <button
                    key={automation.id}
                    onClick={() =>
                      setAttach(
                        on
                          ? attach.filter((id) => id !== automation.id)
                          : [...attach, automation.id],
                      )
                    }
                    className={
                      on
                        ? "rounded-lg border-2 border-[var(--border)] bg-[var(--color-pow-400)] px-2.5 py-1 text-[12px] font-extrabold text-[#12110e]"
                        : "rounded-lg border-2 border-[var(--border)] bg-[var(--bg-sunken)] px-2.5 py-1 text-[12px] font-bold"
                    }
                  >
                    {automation.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] font-medium text-[var(--text-muted)]">
              They&rsquo;ll be attached to this exact post and enabled automatically.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} loading={saving}>
            Schedule
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

/** Default to an hour from now, formatted for datetime-local. */
function defaultWhen(): string {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
