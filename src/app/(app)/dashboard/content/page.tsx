import Link from "next/link";
import { AlertTriangle, Clock, ExternalLink, Heart, MessageCircle, Plus } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClientForAccount } from "@/lib/meta/account";
import { listenersForPost, listenersForStories, storyIsLive, STORY_LIFETIME_MS, type ListenerAutomation } from "@/lib/content";
import { cn, timeAgo } from "@/lib/utils";
import { Badge, Button, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/bits";
import { ContentImage, SyncContentButton } from "@/components/dashboard/content-bits";
import type { IgMedia } from "@/lib/meta/types";

export const dynamic = "force-dynamic";

/**
 * My content: your posts, Reels and live stories, and which automations
 * answer on each. Posts come from the synced cache; stories are read live,
 * because a story is gone within a day.
 */
export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const tab = (await searchParams).tab === "stories" ? "stories" : "posts";

  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, username: true, igUserId: true, accessTokenEnc: true, status: true, lastSyncAt: true },
    orderBy: { createdAt: "asc" },
  });
  const accountIds = accounts.map((a) => a.id);

  const automations: ListenerAutomation[] = (
    await prisma.automation.findMany({
      where: { accountId: { in: accountIds }, triggerType: { in: ["COMMENT", "AD_COMMENT", "STORY_REPLY"] } },
      select: {
        id: true, name: true, enabled: true, triggerType: true, scope: true, priority: true, updatedAt: true,
        matchMode: true, keywords: true, negativeKeywords: true, matchType: true, caseSensitive: true, fuzzyMatch: true,
        accountId: true, media: { select: { mediaId: true } },
      },
    })
  ).map((a) => ({ ...a, mediaIds: a.media.map((m) => m.mediaId) }));
  const byAccount = (accountId: string) =>
    automations.filter((a) => (a as ListenerAutomation & { accountId: string }).accountId === accountId);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My content"
        description="Your posts, Reels and live stories, and which automation answers on each."
        actions={accounts.length > 0 && tab === "posts" ? <SyncContentButton accountIds={accountIds} /> : undefined}
      />

      <div className="mb-5 flex gap-1.5">
        {[
          { key: "posts", label: "Posts & Reels" },
          { key: "stories", label: "Stories" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.key === "posts" ? "/dashboard/content" : "/dashboard/content?tab=stories"}
            className={cn(
              "rounded-xl border-2 px-3.5 py-1.5 text-[13px] font-bold transition-colors",
              tab === t.key
                ? "border-[var(--border)] bg-[var(--color-pow-400)] text-[#12110e]"
                : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)]",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Connect Instagram first"
          description="Your posts and stories show up here once an account is connected."
          action={
            <Link href="/dashboard/accounts">
              <Button variant="gradient">Connect an account</Button>
            </Link>
          }
        />
      ) : tab === "posts" ? (
        <Posts accounts={accounts} byAccount={byAccount} />
      ) : (
        <Stories accounts={accounts} byAccount={byAccount} />
      )}
    </div>
  );
}

type Account = { id: string; username: string; igUserId: string; accessTokenEnc: string | null; status: string; lastSyncAt: Date | null };

async function Posts({ accounts, byAccount }: { accounts: Account[]; byAccount: (id: string) => ListenerAutomation[] }) {
  const media = await prisma.media.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
    take: 60,
  });
  if (media.length === 0) {
    return (
      <EmptyState
        title="No posts yet"
        description="Press Sync posts to pull your latest posts and Reels from Instagram."
      />
    );
  }
  const username = new Map(accounts.map((a) => [a.id, a.username]));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {media.map((post) => {
        const listeners = listenersForPost(byAccount(post.accountId), { id: post.id, isAd: Boolean(post.adId) });
        const video = post.mediaType === "VIDEO" || post.mediaType === "REELS";
        const caption = post.caption?.split("\n")[0] ?? "";
        return (
          <article
            key={post.id}
            className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] shadow-[4px_4px_0_0_var(--shadow-ink)]"
          >
            <div className="flex gap-3 p-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-[var(--border)]">
                <ContentImage src={post.thumbnailUrl ?? (video ? null : post.mediaUrl)} video={video} alt={caption || "Post"} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{TYPE_LABEL[post.mediaType ?? ""] ?? "Post"}</Badge>
                  {post.adId && <Badge tone="info">Ad</Badge>}
                </div>
                <p className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug">{caption || <span className="text-[var(--text-faint)]">No caption</span>}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[11.5px] text-[var(--text-faint)]">
                  <span>{post.timestamp ? timeAgo(post.timestamp) : "Undated"}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.commentsCount.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likeCount.toLocaleString()}</span>
                  {accounts.length > 1 && <span>@{username.get(post.accountId)}</span>}
                  {post.permalink && (
                    <a href={post.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:text-[var(--text)]">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-auto border-t-2 border-[var(--border-soft)] px-3 py-2.5">
              {listeners.length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)]">No automation answers comments here.</p>
              ) : (
                <ul className="space-y-1.5">
                  {listeners.slice(0, 4).map(({ automation, shadowedBy, partlyShadowed }) => (
                    <li key={automation.id} className="text-[12px] leading-snug">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            !automation.enabled ? "bg-[var(--text-faint)]" : shadowedBy ? "bg-[var(--color-zonk-500)]" : "bg-[var(--color-boom-500)]",
                          )}
                          aria-hidden
                        />
                        <Link href={`/dashboard/automations/${automation.id}`} className="truncate font-semibold hover:text-[var(--accent)]">
                          {automation.name}
                        </Link>
                        <span className="shrink-0 text-[var(--text-faint)]">· {listensFor(automation)}</span>
                      </div>
                      {!automation.enabled ? (
                        <p className="pl-3.5 text-[11px] text-[var(--text-faint)]">Paused</p>
                      ) : shadowedBy ? (
                        <p className="pl-3.5 text-[11px] text-[var(--color-zonk-500)]">Never runs here: &ldquo;{shadowedBy.name}&rdquo; answers first.</p>
                      ) : partlyShadowed.length > 0 ? (
                        <p className="pl-3.5 text-[11px] text-[var(--color-zonk-500)]">
                          {partlyShadowed.map((p) => p.keyword).join(", ")}: &ldquo;{partlyShadowed[0].by.name}&rdquo; answers first.
                        </p>
                      ) : null}
                    </li>
                  ))}
                  {listeners.length > 4 && <li className="text-[11px] text-[var(--text-faint)]">+{listeners.length - 4} more</li>}
                </ul>
              )}
              <Link
                href={`/dashboard/automations/new?post=${post.id}`}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-[var(--accent)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> New automation for this post
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function Stories({ accounts, byAccount }: { accounts: Account[]; byAccount: (id: string) => ListenerAutomation[] }) {
  const results = await Promise.all(
    accounts.map(async (account) => {
      const client = await getClientForAccount(account);
      if (!client) return { account, stories: [] as IgMedia[], failed: account.status !== "demo" };
      try {
        const stories = await Promise.race([
          client.getStories(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 8000)),
        ]);
        return { account, stories: stories.filter((s) => storyIsLive(s.timestamp)), failed: false };
      } catch (error) {
        console.warn(`[content] stories unavailable for account ${account.id}: ${(error as Error).message}`);
        return { account, stories: [] as IgMedia[], failed: true };
      }
    }),
  );

  return (
    <div className="space-y-6">
      {results.map(({ account, stories, failed }) => {
        const listeners = listenersForStories(byAccount(account.id));
        const live = listeners.filter((a) => a.enabled);
        return (
          <section key={account.id}>
            {accounts.length > 1 && <h2 className="mb-2 text-[14px] font-extrabold">@{account.username}</h2>}

            <div className="mb-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-3 text-[12.5px]">
              <p className="font-semibold">
                {live.length === 0
                  ? "No automation answers story replies or reactions."
                  : `${live.length === 1 ? "This automation answers" : "These automations answer"} replies and reactions on every story:`}
              </p>
              {listeners.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {listeners.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/dashboard/automations/${a.id}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--border)] px-2 py-0.5 text-[12px] font-bold hover:border-[var(--accent)]",
                          !a.enabled && "opacity-60",
                        )}
                      >
                        {a.name}
                        <span className="font-medium text-[var(--text-faint)]">{a.enabled ? listensFor(a, "reply") : "paused"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {live.length > 1 && (
                <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">
                  When more than one matches the same reply, only one of them runs.
                </p>
              )}
            </div>

            {failed ? (
              <p className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] p-4 text-[12.5px] text-[var(--text-muted)]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-zonk-500)]" />
                We couldn&rsquo;t load this account&rsquo;s stories from Instagram just now. Try again in a moment; if it keeps happening, reconnect the account.
              </p>
            ) : stories.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center text-[12.5px] text-[var(--text-muted)]">
                No live stories right now. Stories show here for the 24 hours they&rsquo;re up.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                {stories.map((story) => {
                  const video = story.media_type === "VIDEO";
                  const left = story.timestamp ? STORY_LIFETIME_MS - (Date.now() - new Date(story.timestamp).getTime()) : null;
                  return (
                    <a
                      key={story.id}
                      href={story.permalink ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="group block overflow-hidden rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)]"
                    >
                      <div className="aspect-[9/16]">
                        <ContentImage src={story.thumbnail_url ?? (video ? null : story.media_url ?? null)} video={video} alt="Story" />
                      </div>
                      <p className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-[var(--text-muted)]">
                        <Clock className="h-3 w-3" />
                        {left !== null ? `${Math.max(1, Math.round(left / 3_600_000))}h left` : "Live"}
                      </p>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Post",
  CAROUSEL_ALBUM: "Carousel",
  VIDEO: "Reel",
  REELS: "Reel",
};

function listensFor(a: Pick<ListenerAutomation, "matchMode" | "keywords">, noun: "comment" | "reply" = "comment"): string {
  if (a.matchMode === "REACTION") return "reactions";
  if (a.matchMode === "REPLY") return "written replies";
  if (a.matchMode !== "KEYWORD" || a.keywords.length === 0) return `every ${noun}`;
  return a.keywords.slice(0, 3).join(", ") + (a.keywords.length > 3 ? ` +${a.keywords.length - 3}` : "");
}
