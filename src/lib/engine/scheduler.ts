import { prisma } from "@/lib/db";
import { hasFeature } from "@/lib/plan";
import { getClientForAccount } from "@/lib/meta/account";
import { MetaApiError } from "@/lib/meta/types";

/**
 * Content scheduler — SendDM's "Schedule & Auto-Post".
 *
 * Instagram publishing is a two-step dance: create a media container, wait for
 * Instagram to finish downloading and transcoding your file, then publish the
 * container. Video and Reels can take a while, so we poll the container's
 * status rather than assuming it's ready.
 *
 * Requires the `instagram_business_content_publish` permission, which is
 * separate from the messaging ones — an account that hasn't granted it gets a
 * clear error rather than a silent no-op.
 */

/** Instagram's own guidance is ~30s for images, minutes for video. */
const CONTAINER_POLL_ATTEMPTS = 20;
const CONTAINER_POLL_DELAY_MS = 3000;

export async function publishScheduledPost(postId: string): Promise<void> {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: postId },
    include: { account: true },
  });
  if (!post) return;
  if (post.status === "published" || post.status === "publishing") return;
  if (post.status === "cancelled") return;

  const workspace = await prisma.workspace.findUnique({
    where: { id: post.account.workspaceId },
    select: { planKey: true },
  });
  if (!hasFeature(workspace, "scheduler")) {
    await fail(post.id, "The post scheduler isn't included in your current plan, so this wasn't published.");
    return;
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: "publishing", attempts: { increment: 1 } },
  });

  const client = await getClientForAccount(post.account);
  if (!client) {
    await fail(
      post.id,
      "Instagram isn't connected for this account, so nothing could be published.",
    );
    return;
  }

  try {
    let creationId: string;

    if (post.mediaType === "CAROUSEL" && post.mediaUrls.length > 1) {
      // Each slide gets its own container, then a carousel container wraps them.
      const children: string[] = [];
      for (const url of post.mediaUrls.slice(0, 10)) {
        const child = await client.createMediaContainer({
          mediaType: guessChildType(url),
          url,
          isCarouselItem: true,
        });
        children.push(child.id);
      }
      const carousel = await client.createMediaContainer({
        mediaType: "CAROUSEL",
        caption: post.caption ?? undefined,
        children,
      });
      creationId = carousel.id;
    } else {
      const container = await client.createMediaContainer({
        mediaType: post.mediaType === "REELS" ? "REELS" : post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
        url: post.mediaUrls[0],
        caption: post.caption ?? undefined,
        thumbUrl: post.thumbUrl ?? undefined,
      });
      creationId = container.id;
    }

    // Wait for Instagram to finish ingesting the media.
    const ready = await waitForContainer(client, creationId);
    if (!ready.ok) {
      await fail(post.id, ready.error);
      return;
    }

    const published = await client.publishMediaContainer(creationId);

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: "published",
        publishedAt: new Date(),
        igMediaId: published.id,
        error: null,
      },
    });

    // Cache the media so the picker and analytics see it immediately.
    const media = await prisma.media.upsert({
      where: { accountId_igMediaId: { accountId: post.accountId, igMediaId: published.id } },
      create: {
        accountId: post.accountId,
        igMediaId: published.id,
        caption: post.caption ?? null,
        mediaType: post.mediaType,
        mediaUrl: post.mediaUrls[0] ?? null,
        thumbnailUrl: post.thumbUrl ?? null,
        timestamp: new Date(),
      },
      update: { caption: post.caption ?? null },
    });

    // Attach and switch on any automations this post was scheduled with.
    for (const automationId of post.attachAutomationIds) {
      const automation = await prisma.automation.findFirst({
        where: { id: automationId, accountId: post.accountId },
      });
      if (!automation) continue;

      await prisma.automationMedia.upsert({
        where: { automationId_mediaId: { automationId, mediaId: media.id } },
        create: { automationId, mediaId: media.id },
        update: {},
      });
      await prisma.automation.update({
        where: { id: automationId },
        data: { enabled: true, scope: "SPECIFIC" },
      });
    }

    // "Next Post" plans are waiting for exactly this moment.
    await attachNextPostPlans(post.accountId, media.id);
  } catch (error) {
    const message =
      error instanceof MetaApiError
        ? error.message
        : ((error as Error).message ?? "Unknown error");
    await fail(post.id, message);
  }
}

/**
 * LinkDM's "Next Post": a plan with no draft code that latches onto whatever
 * publishes next, however it was published.
 */
export async function attachNextPostPlans(accountId: string, mediaId: string): Promise<number> {
  const plans = await prisma.plannedAutomation.findMany({
    where: { accountId, mode: "NEXT_POST", status: "waiting" },
    orderBy: { createdAt: "asc" },
  });

  let matched = 0;
  for (const plan of plans) {
    if (plan.automationId) {
      await prisma.automationMedia.upsert({
        where: { automationId_mediaId: { automationId: plan.automationId, mediaId } },
        create: { automationId: plan.automationId, mediaId },
        update: {},
      });
      await prisma.automation.update({
        where: { id: plan.automationId },
        data: { enabled: true, scope: "SPECIFIC" },
      });
    }
    await prisma.plannedAutomation.update({
      where: { id: plan.id },
      data: { status: "matched", matchedMediaId: mediaId, matchedAt: new Date() },
    });
    matched++;
  }
  return matched;
}

/** Publish anything whose time has come. Runs from the maintenance queue. */
export async function publishDuePosts(): Promise<number> {
  const due = await prisma.scheduledPost.findMany({
    where: { status: "scheduled", scheduledAt: { lte: new Date() } },
    take: 20,
  });

  for (const post of due) {
    await publishScheduledPost(post.id).catch((error) =>
      console.error("[scheduler] publish failed", post.id, error),
    );
  }
  return due.length;
}

async function waitForContainer(
  client: { getContainerStatus: (id: string) => Promise<{ status_code?: string; status?: string }> },
  creationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt++) {
    const status = await client.getContainerStatus(creationId);

    if (status.status_code === "FINISHED") return { ok: true };
    if (status.status_code === "ERROR") {
      return {
        ok: false,
        error: status.status ?? "Instagram couldn't process the media file.",
      };
    }
    if (status.status_code === "EXPIRED") {
      return { ok: false, error: "The upload expired before it could be published." };
    }

    await sleep(CONTAINER_POLL_DELAY_MS);
  }

  return {
    ok: false,
    error: "Instagram was still processing the media after a minute. It may publish late, so check your profile.",
  };
}

async function fail(postId: string, error: string) {
  await prisma.scheduledPost.update({
    where: { id: postId },
    data: { status: "failed", error },
  });
}

function guessChildType(url: string): "IMAGE" | "VIDEO" {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(url) ? "VIDEO" : "IMAGE";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
