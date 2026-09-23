import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, randomToken } from "@/lib/crypto";
import { humanDate, sendEmail } from "./send";

/**
 * Email verification and password reset. See docs/EMAIL.md.
 *
 * Tokens are 32 random bytes, and only their SHA-256 is stored — the same as
 * API keys — so the database alone can't be used to verify an address or reset
 * a password. Each is single-use, expires, and issuing a new one retires the
 * old, so an older link sitting in an inbox stops working.
 */

type Kind = "verify" | "reset";

const TTL: Record<Kind, number> = {
  verify: 24 * 60 * 60 * 1000,
  // Short: a reset link is a password in all but name.
  reset: 60 * 60 * 1000,
};

/** Asking again within this window sends nothing — no mailbombing someone. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function issue(userId: string, kind: Kind): Promise<string | null> {
  const recent = await prisma.emailToken.findFirst({
    where: { userId, kind, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return null;

  // Retire anything still outstanding, so only the newest link works.
  await prisma.emailToken.updateMany({
    where: { userId, kind, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomToken(32);
  await prisma.emailToken.create({
    data: { userId, kind, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL[kind]) },
  });
  return token;
}

/**
 * Spend a token. Returns the user it belongs to, or null if it is unknown,
 * spent, expired or of the wrong kind. The spend is conditional on the token
 * still being unused, so two requests racing with the same link can't both win.
 */
async function consume(token: string, kind: Kind): Promise<string | null> {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) return null;
  const spent = await prisma.emailToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return spent.count === 1 ? row.userId : null;
}

// --- Verification -----------------------------------------------------------

/** Send (or resend) the verification email. Silent if already verified. */
export async function sendVerificationEmail(userId: string): Promise<"sent" | "verified" | "cooldown" | "failed"> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return "failed";
  if (user.emailVerifiedAt) return "verified";

  const token = await issue(userId, "verify");
  if (!token) return "cooldown";

  const result = await sendEmail({
    to: user.email,
    template: "verify_email",
    params: { name: user.name, url: `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}` },
    userId,
  });
  if (result.status === "failed") {
    // Nothing reached them, so don't hold them to the cooldown for it.
    await prisma.emailToken.deleteMany({ where: { tokenHash: hash(token) } });
    return "failed";
  }
  return "sent";
}

/**
 * Verify from a link. Mail scanners — Outlook's Safe Links, corporate gateways —
 * follow links before the person does, and would spend a single-use token on
 * them. So a link that has already been used still counts as success if the
 * address it belongs to is verified: the person clicking it only wants to know
 * they're done.
 */
export async function verifyEmail(token: string): Promise<"verified" | "invalid"> {
  const userId = await consume(token, "verify");
  if (userId) {
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return "verified";
  }
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: hash(token) },
    select: { kind: true, user: { select: { emailVerifiedAt: true } } },
  });
  return row?.kind === "verify" && row.user.emailVerifiedAt ? "verified" : "invalid";
}

// --- Password reset ---------------------------------------------------------

/**
 * Start a reset. Says nothing about whether the address has an account — the
 * caller answers the same either way — so the form can't be used to find out
 * who uses the product.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return;

  const token = await issue(user.id, "reset");
  if (!token) return;

  const result = await sendEmail({
    to: user.email,
    template: "password_reset",
    params: { name: user.name, url: `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}` },
    userId: user.id,
  });
  if (result.status === "failed") await prisma.emailToken.deleteMany({ where: { tokenHash: hash(token) } });
}

/**
 * Finish a reset: set the password, sign out every session — whoever prompted
 * the reset may be signed in somewhere — and tell the owner it happened.
 * Resetting also proves the inbox, so it verifies the address.
 */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const userId = await consume(token, "reset");
  if (!userId) return false;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(password) },
  });
  // Only if it wasn't already: don't overwrite when they first verified.
  await prisma.user.updateMany({
    where: { id: userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  await prisma.session.deleteMany({ where: { userId } });

  await sendEmail({
    to: user.email,
    template: "password_changed",
    params: { name: user.name, at: `${humanDate(new Date())} (UTC)` },
    userId,
  }).catch((error) => console.error("[email] password_changed failed", error));

  return true;
}
