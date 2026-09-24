import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { hasFeature } from "./plan";
import { randomToken } from "./crypto";

/**
 * Public API keys (SendDM's "API Access").
 *
 * The plaintext key is shown exactly once, at creation. We store only a SHA-256
 * hash, so a database leak doesn't hand anyone working credentials. Lookup is by
 * hash, which is why it's a plain digest rather than a slow password hash — the
 * key is 32 bytes of entropy, not a guessable password.
 */

export type Scope = "read" | "write";

export type ApiKeyContext = {
  keyId: string;
  workspaceId: string;
  scopes: Scope[];
};

const PREFIX = "idm_live_";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function createApiKey(
  workspaceId: string,
  name: string,
  scopes: Scope[],
): Promise<{ key: string; id: string; prefix: string }> {
  const key = `${PREFIX}${randomToken(32)}`;

  const record = await prisma.apiKey.create({
    data: {
      workspaceId,
      name,
      keyHash: hashKey(key),
      prefix: key.slice(0, 16),
      scopes,
    },
  });

  return { key, id: record.id, prefix: record.prefix };
}

/**
 * Resolve an `Authorization: Bearer <key>` header to a workspace.
 * Returns null for anything invalid — callers must treat that as 401.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const presented = header.slice(7).trim();
  if (!presented.startsWith(PREFIX)) return null;

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashKey(presented) },
  });
  if (!record || record.revokedAt) return null;

  // Belt and braces: the lookup already matched on the hash, but compare in
  // constant time so this stays correct if the lookup ever changes.
  const a = Buffer.from(record.keyHash);
  const b = Buffer.from(hashKey(presented));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Best-effort usage stamp; never block the request on it.
  void prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    keyId: record.id,
    workspaceId: record.workspaceId,
    scopes: record.scopes as Scope[],
  };
}

export function hasScope(ctx: ApiKeyContext, scope: Scope): boolean {
  return ctx.scopes.includes(scope);
}

/** Wrap a public API handler with key auth and a consistent error shape. */
export function publicRoute(
  scope: Scope,
  handler: (ctx: ApiKeyContext, request: Request) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    const ctx = await authenticateApiKey(request);
    if (!ctx) {
      return Response.json(
        { error: "Invalid or missing API key. Send it as: Authorization: Bearer <key>" },
        { status: 401 },
      );
    }
    if (!hasScope(ctx, scope)) {
      return Response.json(
        { error: `This key doesn't have the "${scope}" scope.` },
        { status: 403 },
      );
    }

    // Checked on every request, not when the key was issued: a key created on
    // Business keeps existing after a downgrade, and must stop working with it.
    const workspace = await prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { planKey: true },
    });
    if (!hasFeature(workspace, "apiAccess")) {
      return Response.json(
        { error: "The public API is part of the Business plan. Upgrade to use this key." },
        { status: 402 },
      );
    }

    try {
      return await handler(ctx, request);
    } catch (error) {
      console.error("[public-api] handler failed", error);
      return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
    }
  };
}
