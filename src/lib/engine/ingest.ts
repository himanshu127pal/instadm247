import { prisma } from "@/lib/db";
import type { NormalizedEvent } from "@/lib/meta/types";
import type { SideEffect } from "@/lib/meta/webhooks";
import { isOptOutMessage, suppress, windowExpiryFrom } from "./guards";
import { canEnterFlow, findMatchingAutomations } from "./match";
import { resumeFlowRun, startFlowRun } from "./run";
import { recordEvent } from "./analytics";

/**
 * Ingest: normalised event → contact/conversation bookkeeping → trigger match →
 * flow run. This is what the `ingest` queue worker calls.
 */

export async function processWebhookEvent(webhookEventId: string): Promise<void> {
  const record = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!record || record.processed) return;

  try {
    const payload = record.payload as { event?: NormalizedEvent; effect?: SideEffect };
    if (payload.event) await handleEvent(reviveEvent(payload.event));
    else if (payload.effect) await handleSideEffect(payload.effect);

    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processed: true, processedAt: new Date() },
    });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { error: (error as Error).message ?? "Unknown error", processedAt: new Date() },
    });
    throw error;
  }
}

/** JSON round-trips turn Dates into strings. */
function reviveEvent(event: NormalizedEvent): NormalizedEvent {
  return { ...event, timestamp: new Date(event.timestamp) };
}

export async function handleEvent(event: NormalizedEvent): Promise<void> {
  const account = await prisma.instagramAccount.findUnique({
    where: { igUserId: event.igUserId },
  });
  if (!account) return;

  // Never react to our own account's activity.
  if (event.igsid === account.igUserId) return;

  const contact = await upsertContact(account.id, event);
  const conversation = await upsertConversation(account.id, contact.id, event);

  // Log the inbound message so the Inbox is a complete record.
  if (event.messageId || event.commentId) {
    await prisma.message
      .create({
        data: {
          conversationId: conversation.id,
          contactId: contact.id,
          igMessageId: event.messageId ?? null,
          direction: "inbound",
          kind: inboundKind(event),
          text: event.text ?? null,
          payload: { kind: event.kind, commentId: event.commentId, mediaId: event.mediaId } as object,
          source: "automation",
          status: "delivered",
        },
      })
      .catch(() => undefined); // duplicate igMessageId — replayed webhook
  }

  // Opt-out beats everything else.
  if (isOptOutMessage(event.text)) {
    await suppress(account.id, event.igsid, "opted_out", event.text ?? undefined);
    return;
  }

  // If a flow is parked waiting for this person's answer, feed it and resume.
  if (event.kind === "DM_KEYWORD" || event.kind === "POSTBACK") {
    const resumed = await feedWaitingRun(account.id, contact.id, event);
    if (resumed) return;
  }

  if (account.automationPaused) return;
  if (conversation.humanTakeover) return;

  const matches = await findMatchingAutomations(account.id, event);
  if (matches.length === 0) return;

  // Run only the best match per event — nobody wants three DMs for one comment.
  const best = matches[0];
  const entry = await canEnterFlow(best.automation, contact.id, event);
  if (!entry.allowed) return;

  await startFlowRun({
    automationId: best.automation.id,
    accountId: account.id,
    contactId: contact.id,
    conversationId: conversation.id,
    event,
    keyword: best.keyword,
  });
}

/**
 * A COLLECT_INPUT node parks the run and waits. When the contact replies, store
 * their answer in the awaited variable and continue from that node.
 */
async function feedWaitingRun(
  accountId: string,
  contactId: string,
  event: NormalizedEvent,
): Promise<boolean> {
  const run = await prisma.flowRun.findFirst({
    where: { accountId, contactId, status: "waiting" },
    orderBy: { startedAt: "desc" },
    include: { automation: { include: { flow: true } } },
  });
  if (!run?.currentNodeId || !run.automation.flow) return false;

  const nodes = (run.automation.flow.nodes as Array<Record<string, unknown>>) ?? [];
  const node = nodes.find((n) => n.id === run.currentNodeId);
  if (!node || node.type !== "COLLECT_INPUT") return false;

  const data = (node.data ?? {}) as { variable?: string; formId?: string };
  if (!data.variable) return false;

  // A button answer carries "ANSWER:<runId>:<nodeId>:<value>".
  let answer = event.text ?? "";
  if (event.payload?.startsWith("ANSWER:")) {
    answer = event.payload.split(":").slice(3).join(":");
  }
  if (!answer) return false;

  const variables = { ...((run.variables as Record<string, unknown>) ?? {}) };
  variables[data.variable] = answer;

  await prisma.flowRun.update({
    where: { id: run.id },
    data: { variables: variables as object, status: "running" },
  });

  if (data.formId) await saveLeadAnswer(data.formId, contactId, run.id, data.variable, answer);

  await resumeFlowRun(run.id, run.currentNodeId);
  return true;
}

async function saveLeadAnswer(
  formId: string,
  contactId: string,
  flowRunId: string,
  field: string,
  value: string,
) {
  const existing = await prisma.leadResponse.findFirst({ where: { formId, contactId, flowRunId } });
  const answers = { ...(((existing?.answers as Record<string, unknown>) ?? {}) as object), [field]: value };

  const form = await prisma.leadForm.findUnique({ where: { id: formId } });
  const fieldCount = Array.isArray(form?.fields) ? form.fields.length : 1;
  const completed = Object.keys(answers).length >= fieldCount;

  if (existing) {
    await prisma.leadResponse.update({
      where: { id: existing.id },
      data: { answers: answers as object, completed },
    });
  } else {
    await prisma.leadResponse.create({
      data: { formId, contactId, flowRunId, answers: answers as object, completed },
    });
  }

  if (completed) {
    const run = await prisma.flowRun.findUnique({ where: { id: flowRunId } });
    if (run) {
      await recordEvent({
        accountId: run.accountId,
        automationId: run.automationId,
        contactId,
        type: "form_completed",
      });
    }
  }
}

// --- Side effects -----------------------------------------------------------

export async function handleSideEffect(effect: SideEffect): Promise<void> {
  const account = await prisma.instagramAccount.findUnique({ where: { igUserId: effect.igUserId } });
  if (!account) return;

  switch (effect.type) {
    case "message_seen": {
      // Powers the "Opened" metric. Instagram reports the last-read message, so
      // mark everything up to that point as seen.
      const contact = await prisma.contact.findUnique({
        where: { accountId_igsid: { accountId: account.id, igsid: effect.igsid } },
      });
      if (!contact) return;
      await prisma.message.updateMany({
        where: {
          contactId: contact.id,
          direction: "outbound",
          seenAt: null,
          createdAt: { lte: effect.at },
        },
        data: { seenAt: effect.at, status: "seen" },
      });
      await recordEvent({ accountId: account.id, contactId: contact.id, type: "message_seen" });
      return;
    }

    case "reaction":
    case "echo":
    case "optin":
      return;

    case "policy_enforcement": {
      // Meta is telling us something is wrong. Pause and surface it loudly.
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          automationPaused: true,
          pausedReason: `Instagram policy notice: ${effect.reason}. Automations are paused until you review this.`,
        },
      });
      return;
    }
  }
}

// --- Contact / conversation bookkeeping -------------------------------------

async function upsertContact(accountId: string, event: NormalizedEvent) {
  // Any inbound interaction refreshes the 24-hour messaging window.
  const windowExpiresAt = windowExpiryFrom(event.timestamp);

  return prisma.contact.upsert({
    where: { accountId_igsid: { accountId, igsid: event.igsid } },
    create: {
      accountId,
      igsid: event.igsid,
      username: event.username ?? null,
      lastInteractionAt: event.timestamp,
      windowExpiresAt,
    },
    update: {
      username: event.username ?? undefined,
      lastInteractionAt: event.timestamp,
      windowExpiresAt,
    },
  });
}

async function upsertConversation(accountId: string, contactId: string, event: NormalizedEvent) {
  const preview = event.text?.slice(0, 160) ?? `[${event.kind.toLowerCase().replace(/_/g, " ")}]`;

  return prisma.conversation.upsert({
    where: { accountId_contactId: { accountId, contactId } },
    create: {
      accountId,
      contactId,
      lastMessageAt: event.timestamp,
      lastMessagePreview: preview,
      unreadCount: 1,
    },
    update: {
      lastMessageAt: event.timestamp,
      lastMessagePreview: preview,
      unreadCount: { increment: 1 },
    },
  });
}

function inboundKind(event: NormalizedEvent): string {
  switch (event.kind) {
    case "STORY_REPLY":
      return "story_reply";
    case "STORY_MENTION":
      return "story_mention";
    case "COMMENT":
    case "AD_COMMENT":
    case "LIVE_COMMENT":
      return "comment";
    case "ICE_BREAKER":
    case "POSTBACK":
      return "postback";
    default:
      return "text";
  }
}
