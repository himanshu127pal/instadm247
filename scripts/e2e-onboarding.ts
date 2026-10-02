/**
 * Getting started: the checklist reflects what the workspace has done, and the
 * tour shows itself once, to new people. Run from e2e-check.ts.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getOnboarding, TOUR_FOR_DAYS } from "../src/lib/onboarding";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

export async function runOnboardingChecks(prisma: PrismaClient, check: Check, section: Section) {
  section("Onboarding: getting started");
  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({ data: { name: `e2e onboard ${tag}`, slug: `e2e-onboard-${tag}`, planKey: "free" } });
  const user = await prisma.user.create({ data: { email: `e2e-onboard-${tag}@example.com`, passwordHash: "x" } });
  const old = await prisma.user.create({
    data: { email: `e2e-onboard-old-${tag}@example.com`, passwordHash: "x", createdAt: new Date(Date.now() - (TOUR_FOR_DAYS + 1) * 86_400_000) },
  });
  const me = { id: user.id, emailVerified: true };
  const done = async () => Object.fromEntries((await getOnboarding(workspace.id, me)).steps.map((s) => [s.key, s.done]));

  try {
    const start = await getOnboarding(workspace.id, me);
    check("a new workspace starts with nothing done", start.steps.filter((s) => s.key !== "verify").every((s) => !s.done) && start.showChecklist);
    check("someone who just signed up gets the tour", start.showTour);
    check("someone who signed up weeks ago doesn't", !(await getOnboarding(workspace.id, { id: old.id, emailVerified: true })).showTour);

    const account = await prisma.instagramAccount.create({
      data: { workspaceId: workspace.id, igUserId: `e2e_onb_${tag}`, username: `onb_${tag}`, status: "demo" },
    });
    check("connecting Instagram ticks its step", (await done()).connect === true && (await done()).automation === false);
    const automation = await prisma.automation.create({
      data: { accountId: account.id, name: "x", triggerType: "COMMENT", enabled: false },
    });
    check("creating an automation ticks its step, not switching it on", (await done()).automation === true && (await done()).live === false);
    await prisma.automation.update({ where: { id: automation.id }, data: { enabled: true } });
    check("switching it on ticks that", (await done()).live === true);

    const contact = await prisma.contact.create({ data: { accountId: account.id, igsid: `onb_c_${tag}` } });
    const conversation = await prisma.conversation.create({ data: { accountId: account.id, contactId: contact.id } });
    await prisma.message.create({
      data: { conversationId: conversation.id, contactId: contact.id, direction: "outbound", source: "human", status: "sent", text: "hi" },
    });
    check("a DM typed by hand doesn't count as the first automated DM", (await done()).first === false);
    await prisma.message.create({
      data: { conversationId: conversation.id, contactId: contact.id, direction: "outbound", source: "automation", status: "sent", text: "auto" },
    });
    const finished = await getOnboarding(workspace.id, me);
    check("the first automated DM finishes it, and the bar goes away", finished.steps.every((s) => s.done) && !finished.showChecklist);

    await prisma.user.update({ where: { id: user.id }, data: { tourCompletedAt: new Date() } });
    check("a finished or skipped tour doesn't come back on its own", !(await getOnboarding(workspace.id, me)).showTour);
    const halfway = await prisma.workspace.create({ data: { name: `e2e onboard2 ${tag}`, slug: `e2e-onboard2-${tag}`, planKey: "free" } });
    await prisma.user.update({ where: { id: user.id }, data: { checklistDismissedAt: new Date() } });
    check("hiding the checklist keeps it hidden", !(await getOnboarding(halfway.id, me)).showChecklist);
    await prisma.workspace.delete({ where: { id: halfway.id } });
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [user.id, old.id] } } });
  }
}
