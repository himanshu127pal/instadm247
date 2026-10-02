import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { platformStaffEmails } from "@/lib/admin";
import { sendEmail } from "@/lib/email/send";
import type { TemplateName, TemplateParams } from "@/lib/email/templates";

/**
 * Support tickets and feature requests. See docs/SUPPORT.md.
 *
 * Customers write from the dashboard; platform staff answer from /admin. Each
 * side is emailed when the other writes. An email failing never fails the
 * action that caused it: the ticket or request is the record, the email is a
 * nudge to go and look at it.
 */

export const TICKET_CATEGORIES = {
  automations: "Automations",
  inbox: "Inbox and messages",
  instagram: "Connecting Instagram",
  billing: "Plan and billing",
  other: "Something else",
} as const;
export type TicketCategory = keyof typeof TICKET_CATEGORIES;

export const TICKET_STATUS = {
  open: "Waiting on us",
  answered: "Waiting on you",
  closed: "Closed",
} as const;

export const REQUEST_AREAS = {
  automations: "Automations",
  inbox: "Inbox",
  broadcasts: "Broadcasts",
  contacts: "Contacts and leads",
  content: "Posts, stories and scheduling",
  analytics: "Analytics",
  ai: "AI",
  billing: "Plans and billing",
  other: "Something else",
} as const;
export type RequestArea = keyof typeof REQUEST_AREAS;

export const REQUEST_STATUS = {
  new: "Received",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Not planned",
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUS;

/** Per workspace per day, so a stuck form or a bad actor can't flood our inbox. */
export const DAILY_LIMIT = 10;

export class SupportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const url = (path: string) => `${env.appUrl}${path}`;

async function quietly<K extends TemplateName>(input: { to: string; template: K; params: TemplateParams[K]; dedupeKey: string; workspaceId?: string; userId?: string | null }) {
  try {
    await sendEmail(input);
  } catch (error) {
    console.error(`[support] ${input.template} email failed`, (error as Error).message);
  }
}

async function emailStaff<K extends "support_ticket_staff" | "feature_request_staff">(
  template: K,
  params: TemplateParams[K],
  key: string,
  includeSupport: boolean,
) {
  for (const to of platformStaffEmails({ includeSupport })) {
    await quietly({ to, template, params, dedupeKey: `${key}:${to}` });
  }
}

async function underLimit(model: "ticket" | "request", workspaceId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count =
    model === "ticket"
      ? await prisma.supportTicket.count({ where: { workspaceId, createdAt: { gte: since } } })
      : await prisma.featureRequest.count({ where: { workspaceId, createdAt: { gte: since } } });
  if (count >= DAILY_LIMIT) {
    throw new SupportError(`You've sent ${DAILY_LIMIT} today. Please add to an existing one, or try again tomorrow.`, 429);
  }
}

type Who = { workspace: { id: string; name: string }; user: { id: string; email: string } };

// --- Tickets ------------------------------------------------------------------

export async function createTicket(who: Who, input: { subject: string; category: TicketCategory; body: string }) {
  await underLimit("ticket", who.workspace.id);
  const ticket = await prisma.supportTicket.create({
    data: {
      workspaceId: who.workspace.id,
      createdById: who.user.id,
      subject: input.subject.trim(),
      category: input.category,
      messages: { create: { authorId: who.user.id, body: input.body.trim() } },
    },
  });
  await emailStaff(
    "support_ticket_staff",
    {
      workspace: who.workspace.name, from: who.user.email, subject: ticket.subject,
      category: TICKET_CATEGORIES[input.category], body: input.body.trim(), url: url(`/admin/support/${ticket.id}`), isReply: false,
    },
    `ticket:${ticket.id}:new`,
    true,
  );
  return ticket;
}

/** The customer writes on their ticket: it's waiting on us again. */
export async function customerReply(who: Who, ticketId: string, body: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, workspaceId: who.workspace.id } });
  if (!ticket) throw new SupportError("Ticket not found.", 404);
  const message = await prisma.supportMessage.create({ data: { ticketId, authorId: who.user.id, body: body.trim() } });
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "open", lastActivityAt: new Date() } });
  await emailStaff(
    "support_ticket_staff",
    {
      workspace: who.workspace.name, from: who.user.email, subject: ticket.subject,
      category: TICKET_CATEGORIES[ticket.category as TicketCategory] ?? ticket.category, body: body.trim(),
      url: url(`/admin/support/${ticket.id}`), isReply: true,
    },
    `ticket-message:${message.id}`,
    true,
  );
  return message;
}

/** Staff answer: it's waiting on the customer, who is emailed the reply. */
export async function staffReply(staff: { id: string }, ticketId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { createdBy: { select: { id: true, email: true, name: true } } },
  });
  if (!ticket) throw new SupportError("Ticket not found.", 404);
  const message = await prisma.supportMessage.create({ data: { ticketId, authorId: staff.id, fromStaff: true, body: body.trim() } });
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "answered", lastActivityAt: new Date() } });

  const to = ticket.createdBy ?? (await ownerOf(ticket.workspaceId));
  if (to) {
    await quietly({
      to: to.email,
      template: "support_reply",
      params: { name: to.name, subject: ticket.subject, body: body.trim(), url: url(`/dashboard/support/${ticket.id}`) },
      dedupeKey: `ticket-message:${message.id}`,
      workspaceId: ticket.workspaceId,
      userId: to.id,
    });
  }
  return message;
}

export async function setTicketStatus(ticketId: string, status: keyof typeof TICKET_STATUS, workspaceId?: string) {
  const where = workspaceId ? { id: ticketId, workspaceId } : { id: ticketId };
  const updated = await prisma.supportTicket.updateMany({ where, data: { status, lastActivityAt: new Date() } });
  if (updated.count === 0) throw new SupportError("Ticket not found.", 404);
}

// --- Feature requests -------------------------------------------------------------

export async function createFeatureRequest(
  who: Who,
  input: { title: string; area: RequestArea; problem: string; outcome?: string | null },
) {
  await underLimit("request", who.workspace.id);
  const request = await prisma.featureRequest.create({
    data: {
      workspaceId: who.workspace.id,
      createdById: who.user.id,
      title: input.title.trim(),
      area: input.area,
      problem: input.problem.trim(),
      outcome: input.outcome?.trim() || null,
    },
  });
  await emailStaff(
    "feature_request_staff",
    {
      workspace: who.workspace.name, from: who.user.email, title: request.title, area: REQUEST_AREAS[input.area],
      problem: request.problem, outcome: request.outcome, url: url("/admin/requests"),
    },
    `request:${request.id}:new`,
    false,
  );
  return request;
}

/** Staff update a request; the customer hears about a new status or note. */
export async function updateFeatureRequest(id: string, change: { status: RequestStatus; staffNote: string | null }) {
  const before = await prisma.featureRequest.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, email: true, name: true } } },
  });
  if (!before) throw new SupportError("Request not found.", 404);
  const note = change.staffNote?.trim() || null;
  const after = await prisma.featureRequest.update({ where: { id }, data: { status: change.status, staffNote: note } });
  if (before.status === after.status && before.staffNote === after.staffNote) return after;

  const to = before.createdBy ?? (await ownerOf(before.workspaceId));
  if (to) {
    await quietly({
      to: to.email,
      template: "feature_request_update",
      params: { name: to.name, title: after.title, status: REQUEST_STATUS[change.status], note, url: url("/dashboard/requests") },
      dedupeKey: `request:${id}:${after.status}:${after.updatedAt.getTime()}`,
      workspaceId: before.workspaceId,
      userId: to.id,
    });
  }
  return after;
}

async function ownerOf(workspaceId: string) {
  const owner = await prisma.membership.findFirst({
    where: { workspaceId, role: "owner" },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  return owner?.user ?? null;
}
