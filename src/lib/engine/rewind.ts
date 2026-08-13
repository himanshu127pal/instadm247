import { prisma } from "@/lib/db";
import { getClientForAccount } from "@/lib/meta/account";
import type { NormalizedEvent } from "@/lib/meta/types";
import { canEnterFlow, evaluateKeywords } from "./match";
import { startFlowRun } from "./run";
import { windowExpiryFrom } from "./guards";

/**
 * Rewind — LinkDM's "backsend DMs to eligible comments".
 *
 * You publish a Reel, it takes off, and *then* you think to build the
 * automation. Rewind goes back over the comments already sitting on that post
 * and DMs the people who still qualify.
 *
 * "Still qualify" is doing real work here. A private reply is only allowed
 * within 7 days of the comment, exactly once per comment, and never for a
 * Live comment once the broadcast ended. Everything ineligible is counted and
 * explained rather than silently dropped.
 */

/** Comments older than this can no longer receive a private reply. */
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type RewindCandidate = {
  commentId: string;
  igsid: string;
  username?: string;
  text: string;
  timestamp: Date;
  mediaId: string;
};

export type RewindPreview = {
  scanned: number;
  eligible: number;
  reasons: Record<string, number>;
  sample: Array<{ username: string; text: string; when: string }>;
};

/**
 * Fetch the comments on an automation's media that Rewind could still reach.
 * Read-only — this is what powers the "you'd reach N people" preview.
 */
export async function findRewindCandidates(
  automationId: string,
): Promise<{ candidates: RewindCandidate[]; preview: RewindPreview }> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    include: { account: true, media: { include: { media: true } } },
  });

  const reasons: Record<string, number> = {};
  const bump = (key: string) => {
    reasons[key] = (reasons[key] ?? 0) + 1;
  };

  if (!automation) {
    return { candidates: [], preview: { scanned: 0, eligible: 0, reasons, sample: [] } };
  }

  // Live comments die with the broadcast, so there is nothing to rewind to.
  if (automation.triggerType === "LIVE_COMMENT") {
    return {
      candidates: [],
      preview: {
        scanned: 0,
        eligible: 0,
        reasons: { live_broadcast_ended: 1 },
        sample: [],
      },
    };
  }

  const client = await getClientForAccount(automation.account);
  if (!client) {
    return { candidates: [], preview: { scanned: 0, eligible: 0, reasons, sample: [] } };
  }

  // Which posts to scan: the automation's own media, or the most recent posts
  // when it's scoped to everything.
  const mediaIds =
    automation.media.length > 0
      ? automation.media.map((m) => m.media.igMediaId)
      : (
          await prisma.media.findMany({
            where: { accountId: automation.accountId },
            orderBy: { timestamp: "desc" },
            take: 10,
            select: { igMediaId: true },
          })
        ).map((m) => m.igMediaId);

  const cutoff = new Date(Date.now() - PRIVATE_REPLY_WINDOW_MS);
  const candidates: RewindCandidate[] = [];
  let scanned = 0;

  for (const igMediaId of mediaIds) {
    let comments: Array<{
      id: string;
      text?: string;
      timestamp?: string;
      from?: { id?: string; username?: string };
      username?: string;
    }> = [];

    try {
      comments = await client.getComments(igMediaId, 100);
    } catch (error) {
      console.warn("[rewind] could not read comments", igMediaId, (error as Error).message);
      continue;
    }

    for (const comment of comments) {
      scanned++;
      const at = comment.timestamp ? new Date(comment.timestamp) : null;

      if (!at || at < cutoff) {
        bump("older_than_7_days");
        continue;
      }

      const igsid = comment.from?.id;
      if (!igsid) {
        // Instagram omits the sender id on comments from accounts that haven't
        // interacted via messaging — there's nobody we can legally DM.
        bump("no_messageable_sender");
        continue;
      }
      if (igsid === automation.account.igUserId) {
        bump("your_own_comment");
        continue;
      }

      const text = comment.text ?? "";
      if (!evaluateKeywords(text, automation).matched) {
        bump("keyword_did_not_match");
        continue;
      }

      const alreadyReplied = await prisma.commentReplyLog.findUnique({
        where: {
          accountId_igCommentId_kind: {
            accountId: automation.accountId,
            igCommentId: comment.id,
            kind: "private",
          },
        },
      });
      if (alreadyReplied) {
        bump("already_replied");
        continue;
      }

      const suppressed = await prisma.suppressionEntry.findUnique({
        where: { accountId_igsid: { accountId: automation.accountId, igsid } },
      });
      if (suppressed) {
        bump("opted_out");
        continue;
      }

      candidates.push({
        commentId: comment.id,
        igsid,
        username: comment.from?.username ?? comment.username,
        text,
        timestamp: at,
        mediaId: igMediaId,
      });
    }
  }

  return {
    candidates,
    preview: {
      scanned,
      eligible: candidates.length,
      reasons,
      sample: candidates.slice(0, 5).map((c) => ({
        username: c.username ?? c.igsid.slice(0, 8),
        text: c.text.slice(0, 60),
        when: c.timestamp.toISOString(),
      })),
    },
  };
}

/**
 * Run a rewind. Each candidate goes through the normal flow engine, so the
 * dispatcher applies exactly the same guards a live comment would get.
 */
export async function runRewind(rewindJobId: string): Promise<void> {
  const job = await prisma.rewindJob.findUnique({
    where: { id: rewindJobId },
    include: { automation: true, account: { select: { igUserId: true } } },
  });
  if (!job || job.status === "running" || job.status === "completed") return;

  await prisma.rewindJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const { candidates } = await findRewindCandidates(job.automationId);

    await prisma.rewindJob.update({
      where: { id: job.id },
      data: { eligibleCount: candidates.length },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const contact = await prisma.contact.upsert({
          where: { accountId_igsid: { accountId: job.accountId, igsid: candidate.igsid } },
          create: {
            accountId: job.accountId,
            igsid: candidate.igsid,
            username: candidate.username ?? null,
            lastInteractionAt: candidate.timestamp,
            windowExpiresAt: windowExpiryFrom(candidate.timestamp),
          },
          update: { username: candidate.username ?? undefined },
        });

        const event: NormalizedEvent = {
          dedupeKey: `rewind:${candidate.commentId}`,
          igUserId: job.account.igUserId,
          kind: "COMMENT",
          igsid: candidate.igsid,
          username: candidate.username,
          text: candidate.text,
          timestamp: candidate.timestamp,
          commentId: candidate.commentId,
          mediaId: candidate.mediaId,
          raw: { rewind: true },
        };

        const entry = await canEnterFlow(job.automation, contact.id, event);
        if (!entry.allowed) {
          skipped++;
          continue;
        }

        const run = await startFlowRun({
          automationId: job.automationId,
          accountId: job.accountId,
          contactId: contact.id,
          event,
          keyword: evaluateKeywords(candidate.text, job.automation).keyword,
        });

        if (run) sent++;
        else skipped++;
      } catch (error) {
        failed++;
        console.error("[rewind] candidate failed", candidate.commentId, error);
      }

      await prisma.rewindJob.update({
        where: { id: job.id },
        data: { sentCount: sent, skippedCount: skipped, failedCount: failed },
      });

      // Pace it — a rewind on a viral post is exactly the situation where
      // hammering the API gets an account throttled.
      await sleep(600);
    }

    await prisma.rewindJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        sentCount: sent,
        skippedCount: skipped,
        failedCount: failed,
      },
    });
  } catch (error) {
    await prisma.rewindJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: (error as Error).message ?? "Unknown error",
        completedAt: new Date(),
      },
    });
  }
}

export { REWIND_REASON_LABELS } from "./rewind-labels";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
