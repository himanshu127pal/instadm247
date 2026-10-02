import { prisma } from "@/lib/db";
import { isEmailConfigured } from "@/lib/env";

/**
 * Getting started: the checklist and the first-run tour. See docs/ONBOARDING.md.
 *
 * Every step is read from what the workspace has actually done, never ticked
 * by hand, so the checklist can't say "done" when it isn't.
 */

export type ChecklistStep = { key: string; label: string; done: boolean; href: string; cta: string };

export type Onboarding = {
  steps: ChecklistStep[];
  /** Hidden by the person, or everything's done. */
  showChecklist: boolean;
  /** New here and hasn't finished or skipped the tour. */
  showTour: boolean;
};

/** Only people who signed up recently get the tour on their own. */
export const TOUR_FOR_DAYS = 14;

export async function getOnboarding(
  workspaceId: string,
  user: { id: string; emailVerified: boolean },
): Promise<Onboarding> {
  const [account, automation, live, sent, prefs] = await Promise.all([
    prisma.instagramAccount.findFirst({ where: { workspaceId }, select: { id: true } }),
    prisma.automation.findFirst({ where: { account: { workspaceId } }, select: { id: true } }),
    prisma.automation.findFirst({ where: { account: { workspaceId }, enabled: true }, select: { id: true } }),
    prisma.message.findFirst({
      where: { direction: "outbound", status: { in: ["sent", "delivered", "seen"] }, source: "automation", conversation: { account: { workspaceId } } },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true, tourCompletedAt: true, checklistDismissedAt: true } }),
  ]);

  const steps: ChecklistStep[] = [
    // Only when we can actually send the email; otherwise there's nothing to do.
    ...(isEmailConfigured()
      ? [{ key: "verify", label: "Confirm your email", done: user.emailVerified, href: "/dashboard/settings", cta: "Confirm your email" }]
      : []),
    { key: "connect", label: "Connect Instagram", done: Boolean(account), href: "/dashboard/accounts", cta: "Connect Instagram" },
    { key: "automation", label: "Create an automation", done: Boolean(automation), href: "/dashboard/automations/new", cta: "Create an automation" },
    { key: "live", label: "Switch it on", done: Boolean(live), href: "/dashboard/automations", cta: "Switch an automation on" },
    { key: "first", label: "Your first automated DM", done: Boolean(sent), href: "/dashboard/content", cta: "Test it with a comment" },
  ];

  const allDone = steps.every((s) => s.done);
  const recent = prefs ? Date.now() - prefs.createdAt.getTime() < TOUR_FOR_DAYS * 86_400_000 : false;
  return {
    steps,
    showChecklist: !allDone && !prefs?.checklistDismissedAt,
    showTour: recent && !prefs?.tourCompletedAt,
  };
}
