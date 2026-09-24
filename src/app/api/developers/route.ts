import { z } from "zod";
import { requireFeature } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { AuthError } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api";
import { createApiKey } from "@/lib/api-keys";
import { encrypt, randomToken } from "@/lib/crypto";
import { verifyCredential } from "@/lib/integrations";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("resource", [
  z.object({
    resource: z.literal("key"),
    name: z.string().min(1).max(80),
    scopes: z.array(z.enum(["read", "write"])).min(1),
  }),
  z.object({
    resource: z.literal("webhook"),
    url: z.string().url(),
    events: z.array(z.string()).min(1),
  }),
  z.object({
    resource: z.literal("integration"),
    provider: z.enum(["kit", "flodesk"]),
    name: z.string().min(1).max(80),
    apiKey: z.string().min(4),
    targetId: z.string().max(120).optional(),
    targetName: z.string().max(120).optional(),
  }),
]);

export const POST = route(async ({ workspace, request }) => {
  const body = await parseBody(request, bodySchema);
  // Kit/Flodesk are a Pro feature; API keys and outbound webhooks are Business.
  requireFeature(workspace, body.resource === "integration" ? "integrations" : "apiAccess");

  if (body.resource === "key") {
    const created = await createApiKey(workspace.id, body.name, body.scopes);
    // The only time the plaintext key ever leaves the server.
    return ok({ key: created.key, id: created.id, prefix: created.prefix });
  }

  if (body.resource === "webhook") {
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        workspaceId: workspace.id,
        url: body.url,
        events: body.events,
        secret: randomToken(24),
      },
    });
    return ok({ endpoint });
  }

  // Verify before storing, so a typo fails now rather than silently later.
  const valid = await verifyCredential(body.provider, body.apiKey);
  if (!valid) {
    return Response.json(
      { error: `${body.provider === "kit" ? "Kit" : "Flodesk"} rejected that API key.` },
      { status: 400 },
    );
  }

  const integration = await prisma.integration.upsert({
    where: {
      workspaceId_provider_targetId: {
        workspaceId: workspace.id,
        provider: body.provider,
        targetId: body.targetId ?? "",
      },
    },
    create: {
      workspaceId: workspace.id,
      provider: body.provider,
      name: body.name,
      apiKeyEnc: encrypt(body.apiKey),
      targetId: body.targetId ?? "",
      targetName: body.targetName ?? null,
    },
    update: {
      name: body.name,
      apiKeyEnc: encrypt(body.apiKey),
      targetName: body.targetName ?? null,
      enabled: true,
      lastError: null,
    },
  });

  return ok({ integration: { ...integration, apiKeyEnc: undefined } });
});

export const DELETE = route(async ({ workspace, request }) => {
  const { id, resource } = await parseBody(
    request,
    z.object({ id: z.string().min(1), resource: z.enum(["key", "webhook", "integration"]) }),
  );

  if (resource === "key") {
    const key = await prisma.apiKey.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!key) throw new AuthError("Key not found.", 404);
    // Revoke rather than delete, so the audit trail survives.
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  } else if (resource === "webhook") {
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!endpoint) throw new AuthError("Endpoint not found.", 404);
    await prisma.webhookEndpoint.delete({ where: { id } });
  } else {
    const integration = await prisma.integration.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!integration) throw new AuthError("Integration not found.", 404);
    await prisma.integration.delete({ where: { id } });
  }

  return ok();
});
