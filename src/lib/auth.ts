import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { hashPassword, randomToken, verifyPassword } from "./crypto";

const COOKIE = "idm_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type ActiveWorkspace = {
  id: string;
  name: string;
  slug: string;
  planKey: string;
  role: string;
};

export async function createSession(userId: string, meta?: { userAgent?: string; ip?: string }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId, token, expiresAt, userAgent: meta?.userAgent, ip: meta?.ip },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  jar.delete(COOKIE);
}

/** Cached per request so layout + page don't double-query. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    avatarUrl: session.user.avatarUrl,
  };
});

/**
 * Resolve the caller's active workspace. Every dashboard query must be scoped
 * through this — it is the tenancy boundary.
 */
export const getActiveWorkspace = cache(async (): Promise<ActiveWorkspace | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const jar = await cookies();
  const preferred = jar.get("idm_workspace")?.value;

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const chosen = memberships.find((m) => m.workspaceId === preferred) ?? memberships[0];
  return {
    id: chosen.workspace.id,
    name: chosen.workspace.name,
    slug: chosen.workspace.slug,
    planKey: chosen.workspace.planKey,
    role: chosen.role,
  };
});

/** Throws if unauthenticated — use in API route handlers. */
export async function requireWorkspace(): Promise<{ user: SessionUser; workspace: ActiveWorkspace }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated", 401);
  const workspace = await getActiveWorkspace();
  if (!workspace) throw new AuthError("No workspace", 403);
  return { user, workspace };
}

/**
 * The notice shown at sign-in when every workspace a user belongs to is
 * suspended. Returns null when at least one is still active, so a user who
 * also belongs to a healthy workspace is not locked out by someone else's
 * suspension.
 */
export async function suspensionNoticeFor(userId: string): Promise<string | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { workspace: { select: { name: true, suspendedAt: true, suspendedReason: true } } },
  });
  if (memberships.length === 0) return null;
  if (memberships.some((m) => !m.workspace.suspendedAt)) return null;

  const suspended = memberships[0].workspace;
  const reason = suspended.suspendedReason?.trim();
  return reason
    ? `${suspended.name} is suspended. ${reason}`
    : `${suspended.name} is suspended. Contact support@instadm247.com.`;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "workspace"
  );
}

export async function registerUser(input: { email: string; password: string; name?: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AuthError("An account with that email already exists", 409);

  const user = await prisma.user.create({
    data: { email, name: input.name?.trim() || null, passwordHash: hashPassword(input.password) },
  });

  // Every user gets a workspace immediately — there is no empty state to handle.
  const base = slugify(input.name || email.split("@")[0]);
  let slug = base;
  for (let i = 2; await prisma.workspace.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const workspace = await prisma.workspace.create({
    data: { name: input.name ? `${input.name}'s workspace` : "My workspace", slug },
  });
  await prisma.membership.create({
    data: { userId: user.id, workspaceId: workspace.id, role: "owner" },
  });

  return { user, workspace };
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new AuthError("Incorrect email or password", 401);
  }
  return user;
}
