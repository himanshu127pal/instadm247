import { z } from "zod";
import { prisma } from "@/lib/db";
import { isImpersonating } from "@/lib/impersonation";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { dispatch } from "@/lib/engine/dispatch";
import { refreshContactProfile } from "@/lib/meta/profile";

export const runtime = "nodejs";

async function assertConversation(workspaceId: string, id: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, account: { workspaceId } },
    include: { contact: true, account: { select: { id: true, username: true } } },
  });
  if (!conversation) throw new AuthError("Conversation not found.", 404);
  return conversation;
}

/** Full message history for one thread. */
export const GET = route<{ id: string }>(async ({ workspace, params }) => {
  const found = await assertConversation(workspace.id, params.id);
  // A sender who arrived before profiles were looked up, or whose lookup
  // failed, is known only by ID. Opening the thread is a good time to ask.
  const account = await prisma.instagramAccount.findUnique({ where: { id: found.accountId } });
  const contact = account ? await refreshContactProfile(account, found.contact) : found.contact;
  const conversation = { ...found, contact };

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Opening a thread clears its unread badge.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { unreadCount: 0 },
  });

  return ok({ conversation, messages });
});

const patchSchema = z.object({
  humanTakeover: z.boolean().optional(),
  status: z.enum(["open", "closed", "snoozed"]).optional(),
});

export const PATCH = route<{ id: string }>(async ({ workspace, request, params }) => {
  const conversation = await assertConversation(workspace.id, params.id);
  const body = await parseBody(request, patchSchema);

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      ...body,
      ...(body.humanTakeover === true ? { takeoverAt: new Date() } : {}),
    },
  });

  return ok({ conversation: updated });
});

const sendSchema = z.object({ text: z.string().min(1).max(1000) });

/**
 * A human reply.
 *
 * This is the ONLY place `humanAgent` is set. The HUMAN_AGENT tag extends the
 * reply window to 7 days and Meta forbids it on automated messages — so it is
 * attached here, where a person actually typed the words, and nowhere else.
 */
export const POST = route<{ id: string }>(async ({ workspace, request, params }) => {
  const conversation = await assertConversation(workspace.id, params.id);
  const { text } = await parseBody(request, sendSchema);

  // Replying by hand means taking the thread over — automation should stop
  // talking over you.
  if (!conversation.humanTakeover) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { humanTakeover: true, takeoverAt: new Date() },
    });
  }

  const result = await dispatch({
    accountId: conversation.accountId,
    contactId: conversation.contactId,
    conversationId: conversation.id,
    target: { to: "user", igsid: conversation.contact.igsid },
    message: { kind: "text", text },
    source: "human",
    viaImpersonation: await isImpersonating(),
    humanAgent: true,
  });

  if (result.status === "skipped") {
    return Response.json({ error: result.explanation }, { status: 409 });
  }
  if (result.status === "failed") {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return ok({ messages });
});
