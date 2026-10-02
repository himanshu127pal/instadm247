/**
 * Support tickets and feature requests. Run from e2e-check.ts. Emails are
 * asserted by what was recorded to send (EmailMessage), the same way the
 * other email checks do.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { setEmailTransport } from "../src/lib/email/send";
import {
  DAILY_LIMIT, SupportError, createFeatureRequest, createTicket, customerReply, setTicketStatus, staffReply, updateFeatureRequest,
} from "../src/lib/support";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

export async function runSupportChecks(prisma: PrismaClient, check: Check, section: Section) {
  const tag = randomBytes(4).toString("hex");
  const savedEnv = { admins: process.env.PLATFORM_ADMIN_EMAILS, support: process.env.PLATFORM_SUPPORT_EMAILS };
  const admin = `e2e-admin-${tag}@example.com`;
  const helper = `e2e-helper-${tag}@example.com`;
  process.env.PLATFORM_ADMIN_EMAILS = admin;
  process.env.PLATFORM_SUPPORT_EMAILS = helper;
  setEmailTransport(async () => ({ messageId: "t" }));

  const workspace = await prisma.workspace.create({ data: { name: `Studio ${tag}`, slug: `e2e-support-${tag}`, planKey: "free" } });
  const other = await prisma.workspace.create({ data: { name: `Other ${tag}`, slug: `e2e-support-o-${tag}`, planKey: "free" } });
  const user = await prisma.user.create({ data: { email: `e2e-support-${tag}@example.com`, passwordHash: "x", name: "Maya Rao" } });
  const staffUser = await prisma.user.create({ data: { email: admin, passwordHash: "x" } });
  await prisma.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: "owner" } });
  const who = { workspace: { id: workspace.id, name: workspace.name }, user: { id: user.id, email: user.email } };
  const emails = (template: string, to?: string) =>
    prisma.emailMessage.findMany({ where: { template, ...(to ? { to } : {}), createdAt: { gte: start } } });
  const start = new Date();

  try {
    section("Support: tickets");
    const ticket = await createTicket(who, { subject: "Replies not sending", category: "inbox", body: "Every reply says failed since this morning." });
    const opened = await emails("support_ticket_staff");
    check("a new ticket emails admins and support staff", opened.some((e) => e.to === admin) && opened.some((e) => e.to === helper), opened.map((e) => e.to).join());
    check("waiting on us", (await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status === "open");

    await staffReply({ id: staffUser.id }, ticket.id, "Reconnect the account, then try again.");
    const replied = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    const toCustomer = await emails("support_reply", user.email);
    check("our reply marks it waiting on the customer and emails them", replied.status === "answered" && toCustomer.length === 1);

    await customerReply(who, ticket.id, "That fixed it, thanks!");
    check("their reply puts it back to waiting on us, and staff hear about it", (await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status === "open" && (await emails("support_ticket_staff", admin)).length === 2);

    await setTicketStatus(ticket.id, "closed", workspace.id);
    await customerReply(who, ticket.id, "One more thing.");
    check("replying to a closed ticket reopens it", (await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status === "open");

    let blocked: unknown = null;
    try {
      await customerReply({ ...who, workspace: { id: other.id, name: other.name } }, ticket.id, "sneaky");
    } catch (error) {
      blocked = error;
    }
    check("another workspace can't write on it", blocked instanceof SupportError && blocked.status === 404);
    let blockedStatus: unknown = null;
    try {
      await setTicketStatus(ticket.id, "closed", other.id);
    } catch (error) {
      blockedStatus = error;
    }
    check("or close it", blockedStatus instanceof SupportError);

    for (let i = 1; i < DAILY_LIMIT; i++) await createTicket(who, { subject: `More ${i}`, category: "other", body: "Another question here." });
    let limited: unknown = null;
    try {
      await createTicket(who, { subject: "One too many", category: "other", body: "Another question here." });
    } catch (error) {
      limited = error;
    }
    check(`after ${DAILY_LIMIT} in a day, more are refused`, limited instanceof SupportError && limited.status === 429);

    section("Support: feature requests");
    const request = await createFeatureRequest(who, { title: "Quiet hours", area: "automations", problem: "I don't want replies at night.", outcome: "" });
    const toAdmins = await emails("feature_request_staff");
    check("a request emails admins only", toAdmins.length === 1 && toAdmins[0].to === admin, toAdmins.map((e) => e.to).join());
    check("an empty outcome is stored as none", request.outcome === null);

    await updateFeatureRequest(request.id, { status: "planned", staffNote: "On the list for next month." });
    const update = await emails("feature_request_update", user.email);
    check("a status change emails the customer", update.length === 1);
    await updateFeatureRequest(request.id, { status: "planned", staffNote: "On the list for next month." });
    check("saving with no change doesn't email again", (await emails("feature_request_update", user.email)).length === 1);
  } finally {
    setEmailTransport(null);
    if (savedEnv.admins === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = savedEnv.admins;
    if (savedEnv.support === undefined) delete process.env.PLATFORM_SUPPORT_EMAILS;
    else process.env.PLATFORM_SUPPORT_EMAILS = savedEnv.support;
    await prisma.emailMessage.deleteMany({ where: { createdAt: { gte: start }, template: { in: ["support_ticket_staff", "support_reply", "feature_request_staff", "feature_request_update"] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, staffUser.id] } } });
  }
}
