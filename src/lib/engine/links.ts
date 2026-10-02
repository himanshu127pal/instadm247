import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { recordEvent } from "./analytics";

/**
 * Click tracking for link buttons in automation DMs.
 *
 * Instagram tells us when a DM is read, but never when a link in it is
 * tapped. So a link button's URL goes out as `/go/<token>`, which counts the
 * tap against the run that sent it and redirects to the real destination.
 * That is what an automation's Clicks and CTR are made of.
 *
 * The token carries the destination, the run and the step, signed with the
 * server's secret: no table to fill, and it can't be edited into an open
 * redirect to somewhere the customer didn't put in their flow.
 */

type LinkClaim = { u: string; r: string; n: string };

const key = () => createHmac("sha256", env.sessionSecret).update("instadm247:tracked-link").digest();

function sign(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url").slice(0, 22);
}

/** The URL to put on a button, in place of `url`. Leaves non-web links alone. */
export function trackedUrl(url: string, flowRunId: string, nodeId: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  const body = Buffer.from(JSON.stringify({ u: url, r: flowRunId, n: nodeId } satisfies LinkClaim)).toString("base64url");
  return `${env.appUrl}/go/${body}.${sign(body)}`;
}

/** The destination and run behind a token, or null if it isn't one of ours. */
export function readTrackedLink(token: string): LinkClaim | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LinkClaim;
    if (typeof claim.u !== "string" || !/^https?:\/\//i.test(claim.u)) return null;
    if (typeof claim.r !== "string" || typeof claim.n !== "string") return null;
    return claim;
  } catch {
    return null;
  }
}

/**
 * Link previewers (Instagram's own, chat apps, crawlers) fetch links nobody
 * tapped. Counting them would inflate every automation's CTR.
 */
export function isPreviewFetch(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|instagram.*bot|bot\b|crawler|spider|preview|slackbot|whatsapp|telegrambot|discordbot|twitterbot|linkedinbot|curl|wget|python-requests|headless/i.test(
    userAgent,
  );
}

/**
 * Count a tap: once per run and step, so someone tapping three times is one
 * click, and CTR can't pass 100%. Never throws; the redirect matters more.
 */
export async function recordTrackedClick(claim: LinkClaim): Promise<void> {
  try {
    const run = await prisma.flowRun.findUnique({
      where: { id: claim.r },
      select: { id: true, accountId: true, automationId: true, contactId: true },
    });
    if (!run) return;
    const already = await prisma.analyticsEvent.findFirst({
      where: {
        type: "link_clicked",
        automationId: run.automationId,
        contactId: run.contactId,
        nodeId: claim.n,
        meta: { path: ["flowRunId"], equals: run.id },
      },
      select: { id: true },
    });
    if (already) return;
    await recordEvent({
      accountId: run.accountId,
      automationId: run.automationId,
      contactId: run.contactId,
      nodeId: claim.n,
      type: "link_clicked",
      meta: { flowRunId: run.id },
    });
  } catch (error) {
    console.error("[tracked-link] could not record a click", (error as Error).message);
  }
}
