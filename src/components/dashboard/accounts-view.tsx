"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { CopyField, SectionCard } from "@/components/dashboard/bits";
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
  automationPaused: boolean;
  pausedReason: string | null;
  slowDownUntil: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  scopes: string[];
  counts: { automations: number; contacts: number; media: number };
};

type Setup = {
  appUrl: string;
  webhookUrl: string;
  redirectUri: string;
  deauthorizeUrl: string;
  deletionUrl: string;
  verifyToken: string;
  scopes: string[];
  webhookFields: string[];
};

export function AccountsView({
  accounts,
  configured,
  missingConfig,
  setup,
  flash,
  icon,
}: {
  accounts: Account[];
  configured: boolean;
  missingConfig: string[];
  setup: Setup;
  flash: { connected?: string; error?: string };
  icon: React.ReactNode;
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
        <div className="rounded-[var(--radius-card)] border border-amber-500/25 bg-amber-500/[0.07] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="space-y-2">
              <p className="text-[14px] font-medium text-amber-200">
                Instagram isn&rsquo;t configured on this server yet
              </p>
              <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                Add {missingConfig.map((key) => <code key={key} className="font-mono">{key} </code>)}
                to your environment and restart. Everything else in the app works without
                them — you just can&rsquo;t connect a live account or send real DMs.
              </p>
            </div>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Link2}
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
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-5"
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
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-flare-500))] text-[15px] font-semibold text-white">
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

              {(account.pausedReason || !account.webhookSubbed) && (
                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
                  {account.pausedReason && (
                    <p className="flex items-start gap-2 text-[12.5px] text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {account.pausedReason}
                    </p>
                  )}
                  {!account.webhookSubbed && account.status === "connected" && (
                    <p className="flex items-start gap-2 text-[12.5px] text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Webhooks aren&rsquo;t subscribed for this account, so nothing will
                      trigger. Reconnect it to fix this.
                    </p>
                  )}
                </div>
              )}

              {(account.status === "token_expired" || account.status === "revoked") && (
                <div className="mt-4 border-t border-[var(--border)] pt-3">
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

      <SectionCard
        title="Meta app configuration"
        description="These are the URLs to paste into your app on developers.facebook.com."
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyField label="OAuth redirect URL" value={setup.redirectUri} />
            <CopyField label="Webhook callback URL" value={setup.webhookUrl} />
            <CopyField label="Webhook verify token" value={setup.verifyToken} />
            <CopyField label="Deauthorize callback URL" value={setup.deauthorizeUrl} />
            <CopyField label="Data deletion request URL" value={setup.deletionUrl} />
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium">Permissions to request</p>
            <div className="flex flex-wrap gap-1.5">
              {setup.scopes.map((scope) => (
                <Badge key={scope} tone="brand">
                  {scope}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium">Webhook fields to subscribe</p>
            <div className="flex flex-wrap gap-1.5">
              {setup.webhookFields.map((field) => (
                <Badge key={field}>{field}</Badge>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              Use <strong className="text-[var(--text)]">API setup with Instagram login</strong> in
              the Instagram use case — no Facebook Page needed. Advanced Access for the
              messaging and comments permissions is required before the app works for
              accounts that don&rsquo;t have a role on it.
            </p>
          </div>
        </div>
      </SectionCard>
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
