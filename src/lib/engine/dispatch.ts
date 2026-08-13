import { prisma } from "@/lib/db";
import { isInstagramConfigured } from "@/lib/env";
import { getClientForAccount } from "@/lib/meta/account";
import { MetaApiError, type OutboundMessage, type SendTarget } from "@/lib/meta/types";
import {
  SKIP_EXPLANATIONS,
  SkipReason,
  type SkipReasonKey,
  armSlowDown,
  checkRateLimit,
  claimCommentReply,
  evaluateWindow,
  isSlowedDown,
  privateReplyStillAllowed,
  releaseCommentReply,
} from "./guards";
import { recordEvent } from "./analytics";
import { emitWebhook } from "./outbound-webhooks";

/**
 * THE ONLY OUTBOUND PATH.
 *
 * Nothing else in this codebase may call InstagramClient.sendMessage. Every
 * guard that keeps a creator's account healthy is applied here, in order, and
 * every attempt is written to the Message table so the user can see exactly
 * what happened and why.
 */

export type DispatchRequest = {
  accountId: string;
  contactId: string;
  conversationId?: string;
  target: SendTarget;
  message: OutboundMessage;
  source: "automation" | "human" | "ai" | "broadcast";
  /**
   * HUMAN_AGENT extends the window to 7 days. Meta forbids it on automated
   * messages and detects misuse, so this is force-disabled unless source is
   * "human". See docs/META_API.md §6.
   */
  humanAgent?: boolean;
  flowRunId?: string;
  nodeId?: string;
  broadcastId?: string;
  /** For private replies: when the comment was made, and whether it was Live. */
  commentAt?: Date;
  isLiveComment?: boolean;
};

export type DispatchResult =
  | { status: "sent"; messageId: string; igMessageId?: string }
  | { status: "skipped"; reason: SkipReasonKey; explanation: string }
  | { status: "failed"; error: string; retryable: boolean; retryAfterMs?: number };

export async function dispatch(req: DispatchRequest): Promise<DispatchResult> {
  const account = await prisma.instagramAccount.findUnique({ where: { id: req.accountId } });
  if (!account) return skip(req, SkipReason.NOT_CONFIGURED);

  // 1. Account-level pause
  if (account.automationPaused && req.source !== "human") {
    return skip(req, SkipReason.ACCOUNT_PAUSED);
  }

  const contact = await prisma.contact.findUnique({ where: { id: req.contactId } });
  if (!contact) return skip(req, SkipReason.SUPPRESSED);

  // 2. Opt-out / suppression — a human reply may still go out, an automation may not.
  if (req.source !== "human") {
    if (contact.optedOut) return skip(req, SkipReason.OPTED_OUT);
    const suppressed = await prisma.suppressionEntry.findUnique({
      where: { accountId_igsid: { accountId: req.accountId, igsid: contact.igsid } },
    });
    if (suppressed) return skip(req, SkipReason.SUPPRESSED);
  }

  // 3. Human takeover pauses automation for that one thread.
  if (req.conversationId && req.source !== "human") {
    const conversation = await prisma.conversation.findUnique({ where: { id: req.conversationId } });
    if (conversation?.humanTakeover) return skip(req, SkipReason.HUMAN_TAKEOVER);
  }

  // 4. Window / comment-age eligibility
  const isPrivateReply = req.target.to === "comment";
  if (isPrivateReply) {
    if (req.commentAt && !privateReplyStillAllowed(req.commentAt, Boolean(req.isLiveComment))) {
      return skip(req, SkipReason.COMMENT_TOO_OLD);
    }
  } else {
    const window = evaluateWindow(contact);
    // The HUMAN_AGENT tag legitimately extends a human's reply to 7 days.
    const humanExtension =
      req.source === "human" &&
      contact.lastInteractionAt &&
      Date.now() - contact.lastInteractionAt.getTime() < 7 * 24 * 60 * 60 * 1000;
    if (!window.open && !humanExtension) return skip(req, SkipReason.WINDOW_EXPIRED);
  }

  // 5. One private reply per comment, claimed atomically.
  let claimedComment: string | null = null;
  if (isPrivateReply) {
    const commentId = (req.target as { to: "comment"; commentId: string }).commentId;
    const won = await claimCommentReply(req.accountId, commentId, "private");
    if (!won) return skip(req, SkipReason.ALREADY_REPLIED);
    claimedComment = commentId;
  }

  // 6. Rate limit
  const slowed = isSlowedDown(account);
  const rateClass = isPrivateReply ? "private_reply" : "message";
  const rate = await checkRateLimit(req.accountId, rateClass, slowed);
  if (!rate.allowed) {
    if (claimedComment) await releaseCommentReply(req.accountId, claimedComment, "private");
    await writeMessage(req, "queued", { skipReason: SkipReason.RATE_LIMITED });
    return {
      status: "failed",
      error: SKIP_EXPLANATIONS.RATE_LIMITED,
      retryable: true,
      retryAfterMs: rate.retryAfterMs,
    };
  }

  // 7. Send
  const client = await getClientForAccount(account);
  if (!client) {
    if (claimedComment) await releaseCommentReply(req.accountId, claimedComment, "private");
    // Demo accounts and unconfigured servers record the message as if it were
    // sent so the product is fully explorable before credentials exist.
    if (account.status === "demo" || !isInstagramConfigured()) {
      const record = await writeMessage(req, "sent");
      await recordEvent({
        accountId: req.accountId,
        contactId: req.contactId,
        type: "message_sent",
        nodeId: req.nodeId,
        meta: { simulated: true },
      });
      return { status: "sent", messageId: record.id };
    }
    return skip(req, SkipReason.NOT_CONFIGURED);
  }

  try {
    const response = await client.sendMessage(req.target, req.message, {
      // Only ever true for text a real person typed.
      humanAgent: req.humanAgent === true && req.source === "human",
    });

    const record = await writeMessage(req, "sent", {
      igMessageId: response.message_id ?? response.id,
    });
    await recordEvent({
      accountId: req.accountId,
      contactId: req.contactId,
      automationId: await automationIdOf(req.flowRunId),
      type: "message_sent",
      nodeId: req.nodeId,
    });
    await touchConversation(req);
    void emitWebhook(account.workspaceId, "message.sent", {
      message_id: record.id,
      contact_id: req.contactId,
      source: req.source,
    }).catch(() => undefined);

    return { status: "sent", messageId: record.id, igMessageId: response.message_id ?? response.id };
  } catch (error) {
    if (claimedComment) await releaseCommentReply(req.accountId, claimedComment, "private");

    const meta = error instanceof MetaApiError ? error : null;

    // Repeated throttling → arm Slow Down mode, exactly like LinkDM does.
    if (meta?.isRateLimit) {
      await armSlowDown(req.accountId, "Instagram throttled this account, so sending was slowed down.");
    }
    if (meta?.isAuthError) {
      await prisma.instagramAccount.update({
        where: { id: req.accountId },
        data: {
          status: "token_expired",
          automationPaused: true,
          pausedReason: "Instagram access expired. Reconnect the account to resume automations.",
        },
      });
    }

    // A window error is a fact of life, not a bug — record it as a skip.
    if (meta?.isWindowError) {
      await writeMessage(req, "skipped", { skipReason: SkipReason.WINDOW_EXPIRED });
      return {
        status: "skipped",
        reason: SkipReason.WINDOW_EXPIRED,
        explanation: SKIP_EXPLANATIONS.WINDOW_EXPIRED,
      };
    }

    const message = meta?.message ?? (error as Error).message ?? "Unknown error";
    await writeMessage(req, "failed", { failReason: message });
    await recordEvent({
      accountId: req.accountId,
      contactId: req.contactId,
      type: "send_failed",
      nodeId: req.nodeId,
      meta: { error: message, code: meta?.code },
    });
    void emitWebhook(account.workspaceId, "message.failed", {
      contact_id: req.contactId,
      source: req.source,
      error: message,
    }).catch(() => undefined);

    return { status: "failed", error: message, retryable: meta?.isRetryable ?? false };
  }
}

// --- helpers ----------------------------------------------------------------

async function skip(req: DispatchRequest, reason: SkipReasonKey): Promise<DispatchResult> {
  await writeMessage(req, "skipped", { skipReason: reason });
  await recordEvent({
    accountId: req.accountId,
    contactId: req.contactId,
    type: "send_skipped",
    nodeId: req.nodeId,
    meta: { reason },
  });
  return { status: "skipped", reason, explanation: SKIP_EXPLANATIONS[reason] };
}

async function writeMessage(
  req: DispatchRequest,
  status: "sent" | "failed" | "skipped" | "queued",
  extra: { igMessageId?: string; failReason?: string; skipReason?: string } = {},
) {
  const conversationId = req.conversationId ?? (await ensureConversationId(req));

  return prisma.message.create({
    data: {
      conversationId,
      contactId: req.contactId,
      direction: "outbound",
      kind: req.message.kind === "buttons" || req.message.kind === "carousel" ? "template" : req.message.kind,
      text: "text" in req.message ? req.message.text : null,
      payload: req.message as object,
      source: req.source,
      humanAgentTag: req.humanAgent === true && req.source === "human",
      status,
      igMessageId: extra.igMessageId ?? null,
      failReason: extra.failReason ?? null,
      skipReason: extra.skipReason ?? null,
      sentAt: status === "sent" ? new Date() : null,
      flowRunId: req.flowRunId ?? null,
      nodeId: req.nodeId ?? null,
    },
  });
}

async function ensureConversationId(req: DispatchRequest): Promise<string> {
  const existing = await prisma.conversation.findUnique({
    where: { accountId_contactId: { accountId: req.accountId, contactId: req.contactId } },
  });
  if (existing) return existing.id;

  const created = await prisma.conversation.create({
    data: { accountId: req.accountId, contactId: req.contactId },
  });
  return created.id;
}

async function touchConversation(req: DispatchRequest) {
  const conversationId = req.conversationId ?? (await ensureConversationId(req));
  const preview = "text" in req.message ? req.message.text : `[${req.message.kind}]`;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastMessagePreview: preview.slice(0, 160) },
  });
}

async function automationIdOf(flowRunId?: string): Promise<string | undefined> {
  if (!flowRunId) return undefined;
  const run = await prisma.flowRun.findUnique({
    where: { id: flowRunId },
    select: { automationId: true },
  });
  return run?.automationId;
}
