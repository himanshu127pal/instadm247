"use client";

import { ImageIcon } from "lucide-react";
import { RemoteImg } from "@/components/ui/remote-img";

export type PostThumb = {
  id: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
};

/**
 * Small, overlapping thumbnails of the posts an automation is on, with "+N"
 * for the rest. Instagram's image links expire, so a broken one falls back to
 * a plain tile rather than a broken-image icon.
 */
export function PostThumbs({ posts, total }: { posts: PostThumb[]; total: number }) {
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center">
      {posts.map((post, i) => (
        <Thumb key={post.id} post={post} first={i === 0} />
      ))}
      {total > posts.length && (
        <span className="ml-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">+{total - posts.length}</span>
      )}
    </span>
  );
}

function Thumb({ post, first }: { post: PostThumb; first: boolean }) {
  // A video's media URL is the video itself; only its thumbnail is an image.
  const src = post.thumbnailUrl ?? (post.mediaType === "VIDEO" || post.mediaType === "REELS" ? null : post.mediaUrl);
  const label = post.caption?.split("\n")[0].slice(0, 80) || "Post";
  return (
    <span
      title={label}
      className={`grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md border-2 border-[var(--bg-raised)] bg-[var(--bg-sunken)] ring-1 ring-[var(--border)] ${first ? "" : "-ml-2"}`}
    >
      <RemoteImg
        src={src}
        alt={label}
        className="h-full w-full object-cover"
        loading="lazy"
        fallback={<ImageIcon className="h-3 w-3 text-[var(--text-faint)]" />}
      />
    </span>
  );
}
