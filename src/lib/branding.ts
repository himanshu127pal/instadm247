import { env } from "@/lib/env";
import { hasFeature } from "@/lib/plan";
import type { OutboundMessage } from "@/lib/meta/types";

/**
 * InstaDM247 branding on the Free plan. See docs/BILLING.md §Branding.
 *
 * Two surfaces carry it: the Link-in-Bio badge, and a short line on automated
 * DMs. Whether a workspace is branded is decided from its plan at the moment
 * a page renders or a DM leaves — never stored — so it goes away the instant
 * someone upgrades, and comes back the day a paid plan ends.
 *
 * What is never branded, on any plan:
 *   - a reply a person typed in the Inbox. Those are their words, and some
 *     carry the HUMAN_AGENT tag, which asserts a human wrote them;
 *   - media, carousels, or any message the line would push past Instagram's
 *     size limit. The customer's own text is never shortened to make room.
 */

type PlanHolder = { planKey?: string | null } | null | undefined;

/** True when this workspace's plan still carries our branding. */
export function isBranded(workspace: PlanHolder): boolean {
  return !hasFeature(workspace, "removeBranding");
}

/** The line added to automated DMs. Short, on its own paragraph. */
export const DM_BRANDING_LINE = "⚡ Sent with InstaDM247 · instadm247.com";

/** At most one branded DM per person per day, so a flow doesn't repeat it on every step. */
export const DM_BRANDING_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Instagram's limits, in UTF-8 bytes — the same numbers client.ts truncates to.
const TEXT_LIMIT = 1000;
const BUTTON_TEXT_LIMIT = 640;

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

/**
 * The message with the branding line added, or null if it can't carry one
 * (media, a carousel, or not enough room left under the limit).
 */
export function withBrandingLine(message: OutboundMessage): OutboundMessage | null {
  const append = (text: string, limit: number) => {
    const branded = `${text.trimEnd()}\n\n${DM_BRANDING_LINE}`;
    return bytes(branded) <= limit ? branded : null;
  };
  if (message.kind === "text") {
    const text = append(message.text, TEXT_LIMIT);
    return text ? { ...message, text } : null;
  }
  if (message.kind === "buttons") {
    const text = append(message.text, BUTTON_TEXT_LIMIT);
    return text ? { ...message, text } : null;
  }
  return null;
}

/**
 * Decide whether this automated DM carries the line. Human replies never do;
 * nor does anything on a plan with `removeBranding`; nor a second DM to the
 * same person within a day.
 */
export function brandOutgoing(input: {
  workspace: PlanHolder;
  source: "automation" | "human" | "ai" | "broadcast";
  message: OutboundMessage;
  lastBrandedAt: Date | null;
  now?: Date;
}): OutboundMessage | null {
  if (input.source === "human") return null;
  if (!isBranded(input.workspace)) return null;
  const now = input.now ?? new Date();
  if (input.lastBrandedAt && now.getTime() - input.lastBrandedAt.getTime() < DM_BRANDING_INTERVAL_MS) return null;
  return withBrandingLine(input.message);
}

/** Where the Link-in-Bio badge points: our site, tagged so sign-ups from it can be counted. */
export function badgeHref(slug: string): string {
  const params = new URLSearchParams({ utm_source: "linkinbio", utm_medium: "badge", utm_campaign: slug });
  return `${env.appUrl}/?${params}`;
}
