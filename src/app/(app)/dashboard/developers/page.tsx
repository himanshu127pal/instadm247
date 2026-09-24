import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, isGoogleConfigured } from "@/lib/env";
import { PROVIDER as GOOGLE_SHEETS, sheetUrl } from "@/lib/integrations/google-sheets";
import { PageHeader } from "@/components/dashboard/bits";
import { DevelopersView } from "@/components/dashboard/developers-view";

export default async function DevelopersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; google?: string; reason?: string }>;
}) {
  const sp = await searchParams;
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
        description="API keys, outbound webhooks, and native connections to Kit, Flodesk and Google Sheets."
      />
      <DevelopersView
        initialTab={sp.tab === "integrations" || sp.tab === "webhooks" ? sp.tab : "keys"}
        googleResult={sp.google ? { status: sp.google, reason: sp.reason ?? null } : null}
        googleAvailable={isGoogleConfigured()}
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
          url: i.provider === GOOGLE_SHEETS && i.targetId ? sheetUrl(i.targetId) : null,
        }))}
      />
    </div>
  );
}
