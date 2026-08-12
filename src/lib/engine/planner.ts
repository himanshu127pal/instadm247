import { prisma } from "@/lib/db";
import { getClientForAccount } from "@/lib/meta/account";

/**
 * DM Planner — LinkDM's "write the AutoDM before the post exists" feature.
 *
 * The creator writes an automation in advance and gets a short draft code. They
 * drop that code in the caption of the post they're about to publish (manually
 * or via Later / Buffer / Meta Suite). This scanner watches for new media
 * carrying the code, attaches the automation to that media, and enables it.
 */

/** Short, unambiguous codes — no 0/O/1/I confusion when typed into a caption. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateDraftCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `DM-${code}`;
}

/** Match the code anywhere in a caption, tolerant of case and a leading #. */
export function captionContainsCode(caption: string | null | undefined, code: string): boolean {
  if (!caption) return false;
  const needle = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const haystack = caption.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return haystack.includes(needle);
}

export type PlannerScanResult = { checked: number; matched: number };

/**
 * Scan for newly published media carrying a waiting draft code.
 * Runs every 5 minutes from the maintenance queue.
 */
export async function scanPlannedAutomations(): Promise<PlannerScanResult> {
  const planned = await prisma.plannedAutomation.findMany({
    where: { status: "waiting" },
    include: { account: true },
  });

  let matched = 0;

  for (const plan of planned) {
    if (plan.expiresAt && plan.expiresAt < new Date()) {
      await prisma.plannedAutomation.update({
        where: { id: plan.id },
        data: { status: "expired" },
      });
      continue;
    }

    // Refresh recent media so a post published 60 seconds ago is visible.
    const client = await getClientForAccount(plan.account);
    if (client) {
      try {
        const recent = await client.getMedia(25);
        for (const item of recent) {
          await prisma.media.upsert({
            where: { accountId_igMediaId: { accountId: plan.accountId, igMediaId: item.id } },
            create: {
              accountId: plan.accountId,
              igMediaId: item.id,
              caption: item.caption ?? null,
              mediaType: item.media_type ?? null,
              mediaUrl: item.media_url ?? null,
              thumbnailUrl: item.thumbnail_url ?? null,
              permalink: item.permalink ?? null,
              timestamp: item.timestamp ? new Date(item.timestamp) : null,
            },
            update: { caption: item.caption ?? null },
          });
        }
      } catch (error) {
        console.warn("[planner] media refresh failed", (error as Error).message);
      }
    }

    // Only look at media published after the plan was created.
    const candidates = await prisma.media.findMany({
      where: { accountId: plan.accountId, createdAt: { gte: plan.createdAt } },
      orderBy: { timestamp: "desc" },
      take: 50,
    });

    const hit = candidates.find((m) => captionContainsCode(m.caption, plan.draftCode));
    if (!hit) continue;

    if (plan.automationId) {
      // Point the automation at the post that just went live and switch it on.
      await prisma.automationMedia.upsert({
        where: { automationId_mediaId: { automationId: plan.automationId, mediaId: hit.id } },
        create: { automationId: plan.automationId, mediaId: hit.id },
        update: {},
      });
      await prisma.automation.update({
        where: { id: plan.automationId },
        data: { enabled: true, scope: "SPECIFIC" },
      });
    }

    await prisma.plannedAutomation.update({
      where: { id: plan.id },
      data: { status: "matched", matchedMediaId: hit.id, matchedAt: new Date() },
    });
    matched++;
  }

  return { checked: planned.length, matched };
}
