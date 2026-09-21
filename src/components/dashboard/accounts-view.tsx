"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Link2,
  Plus,
  RefreshCw,
  Satellite,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { initials, timeAgo } from "@/lib/utils";

type Account = {
  id: string;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  accountType: string | null;
  followersCount: number;
  status: string;
  webhookSubbed: boolean;
  webhookError: string | null;
  webhookFields: string[];
  automationPaused: boolean;
  pausedReason: string | null;
  slowDownUntil: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  scopes: string[];
  counts: { automations: number; contacts: number; media: number };
};

export function AccountsView({
  accounts,
  configured,
  flash,
}: {
  accounts: Account[];
  configured: boolean;
  flash: { connected?: string; error?: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (flash.connected) toast.success(flash.connected);
    if (flash.error) toast.error(flash.error);
  }, [flash.connected, flash.error]);

  async function sync(accountId: string) {
    setBusy(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/sync`, { method: "POST" });
      const data = (await res.json()) as { error?: string; media?: number };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast.success(`Synced ${data.media ?? 0} posts`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function resubscribe(accountId: string) {
    setBusy(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/resubscribe`, { method: "POST" });
      const data = (await res.json()) as { error?: string; degraded?: boolean; fields?: string[] };
      if (!res.ok) throw new Error(data.error ?? "Instagram refused the subscription");
      if (data.degraded) {
        toast.success(`Subscribed, but only to ${(data.fields ?? []).join(", ")}`);
      } else {
        toast.success("Webhooks subscribed");
      }
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(account: Account) {
    if (
      !confirm(
        `Disconnect @${account.username}? This permanently deletes its automations, contacts, conversations and stats.`,
      )
    ) {
      return;
    }
    setBusy(account.id);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect this account");
      toast.success(`@${account.username} disconnected`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {!configured && (
        <div className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--color-pow-400)]/40 shadow-[4px_4px_0_0_var(--shadow-ink)] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-zonk-500)]" />
            <div className="space-y-2">
              <p className="text-[14px] font-medium text-[var(--text)]">
                Connecting Instagram is temporarily unavailable
              </p>
              <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                This is on our side, not yours, and we&rsquo;re on it. Everything else in
                the app keeps working — you can build flows now and connect an account
                once this clears.
              </p>
            </div>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title="No account connected yet"
          description="You'll sign in on Instagram's own screen and grant messaging permissions. We never see your password."
          action={
            <a href="/api/instagram/connect">
              <Button variant="gradient" disabled={!configured}>
                <Plus className="h-4 w-4" />
                Connect Instagram
              </Button>
            </a>
          }
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <article
              key={account.id}
              id={account.id}
              className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]"
            >
              <div className="flex flex-wrap items-start gap-4">
                {account.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.profilePictureUrl}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-kapow-400),var(--color-zap-500))] text-[15px] font-semibold text-white">
                    {initials(account.username)}
                  </span>
                )}

                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15.5px] font-semibold">@{account.username}</p>
                    <StatusBadge account={account} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">
                    {account.name && `${account.name} · `}
                    {account.followersCount.toLocaleString()} followers
                    {account.accountType && ` · ${account.accountType.toLowerCase()}`}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1.5">
                      <Workflow className="h-3.5 w-3.5" />
                      {account.counts.automations} automation
                      {account.counts.automations === 1 ? "" : "s"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {account.counts.contacts.toLocaleString()} contacts
                    </span>
                    <span>{account.counts.media} posts synced</span>
                    {account.lastSyncAt && <span>synced {timeAgo(account.lastSyncAt)}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy === account.id}
                    onClick={() => sync(account.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Disconnect @${account.username}`}
                    onClick={() => disconnect(account)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {(account.pausedReason || !account.webhookSubbed || account.webhookError) && (
                <div className="mt-4 space-y-2 border-t-2 border-[var(--border-soft)] pt-3">
                  {account.pausedReason && (
                    <p className="flex items-start gap-2 text-[12.5px] text-[var(--color-zonk-500)]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {account.pausedReason}
                    </p>
                  )}
                  {!account.webhookSubbed && account.status === "connected" && (
                    <div className="space-y-1.5">
                      <p className="flex items-start gap-2 text-[12.5px] text-[var(--color-zonk-500)]">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Webhooks aren&rsquo;t subscribed for this account, so nothing will
                        trigger.
                      </p>
                      {account.webhookError && (
                        <p className="pl-[22px] font-mono text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                          Instagram said: {account.webhookError}
                        </p>
                      )}
                      <div className="pl-[22px]">
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy === account.id}
                          onClick={() => resubscribe(account.id)}
                        >
                          <Satellite className="h-3.5 w-3.5" />
                          Retry subscription
                        </Button>
                      </div>
                    </div>
                  )}
                  {account.webhookSubbed && account.webhookError && (
                    <p className="flex items-start gap-2 text-[12.5px] text-[var(--color-zap-500)]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Partly subscribed: {account.webhookFields.join(", ")}. Some triggers
                      won&rsquo;t fire.
                    </p>
                  )}
                </div>
              )}

              {(account.status === "token_expired" || account.status === "revoked") && (
                <div className="mt-4 border-t-2 border-[var(--border-soft)] pt-3">
                  <a href="/api/instagram/connect">
                    <Button variant="primary" size="sm">
                      Reconnect @{account.username}
                    </Button>
                  </a>
                </div>
              )}
            </article>
          ))}

          <a href="/api/instagram/connect" className="inline-block">
            <Button variant="secondary" disabled={!configured}>
              <Plus className="h-4 w-4" />
              Connect another account
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ account }: { account: Account }) {
  if (account.status === "revoked") return <Badge tone="danger">Access revoked</Badge>;
  if (account.status === "token_expired") return <Badge tone="danger">Reconnect needed</Badge>;
  if (account.automationPaused) return <Badge tone="warning">Paused</Badge>;
  if (account.slowDownUntil && new Date(account.slowDownUntil) > new Date()) {
    return <Badge tone="warning">Slow Down mode</Badge>;
  }
  return <Badge tone="success">Connected</Badge>;
}
