import type { MediaUpload } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkMedia, checkPost, type MediaFacts, type PostType } from "./rules";
import { tokenFromUrl } from "./store";

export function factsOf(u: Pick<MediaUpload, "kind" | "mime" | "width" | "height" | "sizeBytes" | "durationSec">): MediaFacts {
  return {
    kind: u.kind === "video" ? "video" : "image",
    mime: u.mime,
    width: u.width,
    height: u.height,
    sizeBytes: u.sizeBytes,
    durationSec: u.durationSec ?? undefined,
  };
}

/**
 * Check a post's media before it's scheduled, so it can't fail at publish
 * time for a reason we could have caught. Files uploaded here are matched to
 * the workspace's own unused uploads and checked against Instagram's rules.
 * Links to files hosted elsewhere can't be measured; Instagram checks those.
 *
 * Returns the uploads to link to the post, or the reason it can't be made.
 */
export async function checkScheduledMedia(
  workspaceId: string,
  postType: PostType,
  mediaUrls: string[],
): Promise<{ uploads: MediaUpload[]; error: null } | { uploads: null; error: string }> {
  const tokens = mediaUrls.map(tokenFromUrl);
  const uploads = await prisma.mediaUpload.findMany({
    // An upload already in a post isn't reused: the sweep deletes it on that
    // post's schedule, not this one's.
    where: { workspaceId, scheduledPostId: null, token: { in: tokens.filter((t): t is string => t !== null) } },
  });
  const byToken = new Map(uploads.map((u) => [u.token, u]));
  if (tokens.some((t) => t !== null && !byToken.has(t))) {
    return { uploads: null, error: "One of those files is no longer available. Upload it again." };
  }
  if (new Set(tokens.filter(Boolean)).size !== tokens.filter(Boolean).length) {
    return { uploads: null, error: "The same file is in this post twice." };
  }

  const facts = tokens.flatMap((t) => (t ? [factsOf(byToken.get(t)!)] : []));
  const problems = [
    ...facts.flatMap((f) => checkMedia(f, postType).errors),
    ...(facts.length === mediaUrls.length ? checkPost(facts, postType).errors : []),
  ];
  if (postType === "CAROUSEL" && mediaUrls.length < 2) problems.push("A carousel needs at least two files.");
  if (postType !== "CAROUSEL" && mediaUrls.length > 1) problems.push("Only a carousel can have more than one file.");
  if (problems.length) return { uploads: null, error: [...new Set(problems)].join(" ") };
  return { uploads, error: null };
}
