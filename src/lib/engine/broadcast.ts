import { prisma } from "@/lib/db";
import { hasFeature } from "@/lib/plan";
import type { OutboundMessage } from "@/lib/meta/types";
import { dispatch } from "./dispatch";
import { evaluateWindow } from "./guards";
import { renderForContact } from "./template";

/** Personalise a broadcast for one contact: every text field, tokens filled in. */
export function personalise(
  message: OutboundMessage,
  contact: Parameters<typeof renderForContact>[1],
  account: { username: string },
): OutboundMessage {
  const fill = (text: string) => renderForContact(text, contact, account);
  switch (message.kind) {
    case "text":
      return { kind: "text", text: fill(message.text) };
    case "buttons":
      return {
        ...message,
        text: fill(message.text),
        buttons: message.buttons.map((b) => (b.type === "web_url" ? { ...b, url: fill(b.url) } : b)),
      };
    case "carousel":
      return {
        kind: "carousel",
        slides: message.slides.map((s) => ({ ...s, title: fill(s.title), subtitle: s.subtitle ? fill(s.subtitle) : s.subtitle })),
      };
    default:
      return message;
  }
}

/**
 * Broadcasts and Smart Re-engage.
 *
 * A broadcast can only legally reach people whose 24-hour messaging window is
 * still open — there is no API for unsolicited bulk DMs, and that's the point.
 * We surface the eligible count before sending so the number is never a
 * surprise.
 */

export type SegmentFilter = {
  tags?: string[];
  excludeTags?: string[];
  /** Only contacts who interacted within this many hours. */
  activeWithinHours?: number;
  isFollower?: boolean;
  /** Only those we can actually message right now. */
  windowOpenOnly?: boolean;
  customField?: { key: string; value: string };
};

export function buildContactWhere(accountId: string, filter: SegmentFilter) {
  const where: Record<string, unknown> = { accountId, optedOut: false };

  if (filter.tags?.length) where.tags = { hasSome: filter.tags };
  if (filter.excludeTags?.length) where.NOT = { tags: { hasSome: filter.excludeTags } };
  if (typeof filter.isFollower === "boolean") where.isFollower = filter.isFollower;

  if (filter.activeWithinHours) {
    where.lastInteractionAt = {
      gte: new Date(Date.now() - filter.activeWithinHours * 60 * 60 * 1000),
    };
  }
  if (filter.windowOpenOnly !== false) {
    where.windowExpiresAt = { gt: new Date() };
  }

  return where;
}

export async function previewAudience(accountId: string, filter: SegmentFilter) {
  const [total, eligible] = await Promise.all([
    prisma.contact.count({ where: buildContactWhere(accountId, { ...filter, windowOpenOnly: false }) }),
    prisma.contact.count({ where: buildContactWhere(accountId, { ...filter, windowOpenOnly: true }) }),
  ]);
  return { total, eligible, blocked: total - eligible };
}

/** Send a broadcast. Called by the `broadcast` queue worker. */
export async function runBroadcast(broadcastId: string): Promise<void> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { segment: true, account: { select: { username: true } } },
  });
  if (!broadcast) return;
  if (broadcast.status === "sending" || broadcast.status === "sent") return;

  // Scheduled before a downgrade, run after it: refuse with a reason rather
  // than send a Pro feature on a plan that doesn't include it.
  const workspace = await prisma.workspace.findUnique({
    where: { id: broadcast.workspaceId },
    select: { planKey: true },
  });
  if (!hasFeature(workspace, "broadcasts")) {
    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        status: "failed",
        error: "Broadcasts aren't included in your current plan, so this one wasn't sent.",
      },
    });
    return;
  }

  const filter = ((broadcast.segment?.filter as SegmentFilter) ?? {}) as SegmentFilter;

  // Smart Re-engage targets people who went quiet but are still reachable.
  if (broadcast.kind === "REENGAGE" && broadcast.reengageAfterHours) {
    filter.activeWithinHours = 24;
  }

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: "sending", startedAt: new Date() },
  });

  const contacts = await prisma.contact.findMany({
    where: buildContactWhere(broadcast.accountId, { ...filter, windowOpenOnly: true }),
    orderBy: { lastInteractionAt: "desc" },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const contact of contacts) {
    // Re-check per contact — the window may have closed mid-run.
    if (!evaluateWindow(contact).open) {
      skipped++;
      continue;
    }

    // Smart Re-engage: don't nudge someone we messaged very recently.
    if (broadcast.kind === "REENGAGE") {
      const recent = await prisma.message.findFirst({
        where: {
          contactId: contact.id,
          direction: "outbound",
          createdAt: { gte: new Date(Date.now() - (broadcast.reengageAfterHours ?? 12) * 3600_000) },
        },
        select: { id: true },
      });
      if (recent) {
        skipped++;
        continue;
      }
    }

    const result = await dispatch({
      accountId: broadcast.accountId,
      contactId: contact.id,
      target: { to: "user", igsid: contact.igsid },
      // Each person gets their own name, not a literal "{{first_name}}".
      message: personalise(broadcast.payload as unknown as OutboundMessage, contact, broadcast.account),
      source: "broadcast",
      broadcastId: broadcast.id,
    });

    if (result.status === "sent") sent++;
    else if (result.status === "skipped") skipped++;
    else failed++;

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { sentCount: sent, failedCount: failed, skippedCount: skipped },
    });

    // Gentle pacing so a big send doesn't spike straight into a rate limit.
    await sleep(350);
  }

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: "sent",
      completedAt: new Date(),
      targetCount: contacts.length,
      eligibleCount: contacts.length,
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
    },
  });
}

/** Fire any recurring re-engagement campaigns that are due. */
export async function runDueReengagements(): Promise<number> {
  const campaigns = await prisma.broadcast.findMany({
    where: { kind: "REENGAGE", recurring: true, status: { in: ["scheduled", "sent"] } },
  });

  let started = 0;
  for (const campaign of campaigns) {
    const lastRun = campaign.completedAt ?? campaign.startedAt;
    const intervalMs = (campaign.reengageAfterHours ?? 24) * 3600_000;
    if (lastRun && Date.now() - lastRun.getTime() < intervalMs) continue;
    await runBroadcast(campaign.id);
    started++;
  }
  return started;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
