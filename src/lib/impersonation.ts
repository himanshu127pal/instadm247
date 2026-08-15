import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { randomToken } from "./crypto";
import { audit } from "./admin";

/**
 * Support impersonation — signing in as a customer to reproduce what they are
 * seeing, without asking for their password.
 *
 * This is a normal support tool, and it is also the most dangerous thing in the
 * codebase, because a customer's inbox contains messages from people who never
 * signed up here. Three constraints make it defensible:
 *
 * 1. **Read-only for anything outbound.** `isImpersonating()` is checked by the
 *    dispatcher, so an impersonated session cannot send a DM, run a broadcast,
 *    or reply in the Inbox. That is not only about trust: replies typed in the
 *    Inbox carry Meta's HUMAN_AGENT tag, which asserts a human wrote them, and
 *    the human in question would not be the account owner.
 * 2. **Short-lived.** Sessions expire in an hour rather than the usual thirty
 *    days, so a forgotten tab is not a standing key to someone's account.
 * 3. **Audited with a reason.** Starting and ending are both recorded, and the
 *    reason is required at the call site.
 */

const COOKIE = "idm_session";
const ADMIN_RETURN_COOKIE = "idm_admin_return";
const IMPERSONATION_MINUTES = 60;

export type ImpersonationState = {
  active: true;
  /** The customer being viewed. */
  userId: string;
  /** The staff member doing the viewing. */
  byUserId: string;
  byEmail: string | null;
  expiresAt: Date;
};

/** Null when this is an ordinary session. Cached per request. */
export const getImpersonation = cache(async (): Promise<ImpersonationState | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session?.impersonatedByUserId) return null;
  if (session.expiresAt < new Date()) return null;

  const actor = await prisma.user.findUnique({
    where: { id: session.impersonatedByUserId },
    select: { email: true },
  });

  return {
    active: true,
    userId: session.userId,
    byUserId: session.impersonatedByUserId,
    byEmail: actor?.email ?? null,
    expiresAt: session.expiresAt,
  };
});

/** True when the caller must not be allowed to cause anything outbound. */
export async function isImpersonating(): Promise<boolean> {
  return (await getImpersonation()) !== null;
}

/**
 * Swap the caller's cookie for a short-lived session belonging to `targetUserId`,
 * stashing the staff member's own session so they can step back out.
 */
export async function startImpersonation(opts: {
  staffUserId: string;
  targetUserId: string;
  reason: string;
  workspaceId: string;
}): Promise<void> {
  const reason = opts.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required to impersonate");

  // Audit first: if this write fails, no session is minted.
  await audit({
    actorUserId: opts.staffUserId,
    action: "impersonate.start",
    targetType: "user",
    targetId: opts.targetUserId,
    reason,
    meta: { workspaceId: opts.workspaceId },
  });

  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + IMPERSONATION_MINUTES * 60 * 1000);
  await prisma.session.create({
    data: {
      userId: opts.targetUserId,
      token,
      expiresAt,
      impersonatedByUserId: opts.staffUserId,
    },
  });

  if (existing) {
    jar.set(ADMIN_RETURN_COOKIE, existing, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Outlives the impersonation session so the way back is always there.
      expires: new Date(Date.now() + 12 * 60 * 60 * 1000),
    });
  }

  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Drop the impersonated session and restore the staff member's own. */
export async function stopImpersonation(): Promise<void> {
  const state = await getImpersonation();
  const jar = await cookies();
  const current = jar.get(COOKIE)?.value;

  if (current) await prisma.session.deleteMany({ where: { token: current } });

  if (state) {
    await audit({
      actorUserId: state.byUserId,
      action: "impersonate.end",
      targetType: "user",
      targetId: state.userId,
    }).catch(() => undefined);
  }

  const back = jar.get(ADMIN_RETURN_COOKIE)?.value;
  jar.delete(ADMIN_RETURN_COOKIE);
  if (back) {
    const restored = await prisma.session.findUnique({ where: { token: back } });
    if (restored && restored.expiresAt > new Date()) {
      jar.set(COOKIE, back, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: restored.expiresAt,
      });
      return;
    }
  }
  jar.delete(COOKIE);
}
