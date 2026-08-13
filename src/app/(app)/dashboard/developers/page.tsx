import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/bits";
import { DevelopersView } from "@/components/dashboard/developers-view";

export default async function DevelopersPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const [keys, endpoints, integrations] = await Promise.all([
    prisma.apiKey.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.webhookEndpoint.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.integration.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Developers"
        description="API keys, outbound webhooks, and native connections to Kit and Flodesk."
      />
      <DevelopersView
        appUrl={env.appUrl}
        keys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          scopes: k.scopes,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        }))}
        endpoints={endpoints.map((e) => ({
          id: e.id,
          url: e.url,
          events: e.events,
          enabled: e.enabled,
          lastStatus: e.lastStatus,
          lastFiredAt: e.lastFiredAt?.toISOString() ?? null,
        }))}
        integrations={integrations.map((i) => ({
          id: i.id,
          provider: i.provider,
          name: i.name,
          targetName: i.targetName,
          enabled: i.enabled,
          lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
          lastError: i.lastError,
        }))}
      />
    </div>
  );
}
