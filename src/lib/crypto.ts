import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

/**
 * Token encryption at rest (AES-256-GCM) and password hashing (scrypt).
 *
 * Access tokens are the keys to a creator's Instagram account. They are never
 * stored in plaintext and never logged.
 */

function key(): Buffer {
  const raw = Buffer.from(env.encryptionKey, "base64");
  if (raw.length === 32) return raw;
  // Tolerate a non-base64 / wrong-length key by stretching it deterministically,
  // so a misconfigured dev env degrades instead of crashing. Production is
  // guarded by assertProductionSecrets().
  return scryptSync(env.encryptionKey, "instadm247-key-salt", 32);
}

/** Encrypt a secret. Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(
    ".",
  );
}

/** Decrypt a value produced by `encrypt`. Returns null if it can't be read. */
export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// --- Passwords --------------------------------------------------------------

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length, SCRYPT_PARAMS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- Webhook signatures -----------------------------------------------------

/**
 * Verify Meta's `X-Hub-Signature-256` header against the RAW request body.
 * Constant-time. See docs/META_API.md §4.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Short, URL-safe, unguessable token (sessions, tracked links, draft codes). */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
