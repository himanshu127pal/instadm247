import { headers } from "next/headers";
import { prisma } from "./db";
import { getCurrentUser } from "./auth";

/**
 * Platform staff — the people who run InstaDM247, as opposed to the customers
 * who use it. This is deliberately separate from `Membership.role`, which is
 * about a user's standing inside one workspace.
 *
 * Two levels, because most support work does not need the destructive half:
 *
 *   support  read customers, impersonate, leave notes
 *   admin    the above, plus suspend, unsuspend and change plans
 *
 * Bootstrapping is by environment variable rather than a UI. There is no
 * chicken-and-egg problem that way, nothing to seed, and revoking access is a
 * deploy rather than a database edit — which is the right shape for a role that
 * can read every customer's messages.
 */

export type PlatformRole = "none" | "support" | "admin";

function configuredAdmins(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function configuredSupport(): string[] {
  return (process.env.PLATFORM_SUPPORT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The env vars are the source of truth; the column is a cache so listings and
 * the audit log can show a role without re-reading config. Recomputed on every
 * check, so removing an address from the env revokes access immediately rather
 * than at next login.
 */
export function roleForEmail(email: string): PlatformRole {
  const normalised = email.trim().toLowerCase();
  if (configuredAdmins().includes(normalised)) return "admin";
  if (configuredSupport().includes(normalised)) return "support";
  return "none";
}

export type PlatformStaff = {
  id: string;
  email: string;
  name: string | null;
  role: Exclude<PlatformRole, "none">;
};

/** Returns the signed-in user if they are platform staff, else null. */
export async function getPlatformStaff(): Promise<PlatformStaff | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const role = roleForEmail(user.email);
  if (role === "none") return null;

  // Keep the cached column honest without making it authoritative.
  await prisma.user
    .updateMany({ where: { id: user.id, platformRole: { not: role } }, data: { platformRole: role } })
    .catch(() => undefined);

  return { id: user.id, email: user.email, name: user.name, role };
}

/** Throws unless the caller is staff with at least the required level. */
export async function requirePlatformStaff(
  minimum: Exclude<PlatformRole, "none"> = "support",
): Promise<PlatformStaff> {
  const staff = await getPlatformStaff();
  if (!staff) throw new AdminAccessError("Not platform staff");
  if (minimum === "admin" && staff.role !== "admin") {
    throw new AdminAccessError("Requires the admin role");
  }
  return staff;
}

export class AdminAccessError extends Error {}

/**
 * Record a privileged action.
 *
 * Deliberately awaited rather than fire-and-forget: an action that reaches
 * customer data should not be able to happen without the record of it landing
 * first. If the write fails, the caller fails.
 */
export async function audit(entry: {
  actorUserId: string;
  action: string;
  targetType: "workspace" | "user" | "account";
  targetId: string;
  reason?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const h = await headers().catch(() => null);
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
      meta: (entry.meta ?? {}) as object,
      ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h?.get("user-agent") ?? null,
    },
  });
}
