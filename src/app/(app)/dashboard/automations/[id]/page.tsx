import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { isBranded } from "@/lib/branding";
import { BrandingNotice } from "@/components/dashboard/branding-notice";
import { prisma } from "@/lib/db";
import { getFlowFunnel } from "@/lib/queries";
import { flowGraphSchema } from "@/lib/engine/schema";
import { AutomationEditor } from "@/components/dashboard/automation-editor";
import type { FormOption } from "@/components/flow/inspector";

export default async function AutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const automation = await prisma.automation.findFirst({
    where: { id, account: { workspaceId: workspace.id } },
    include: {
      flow: true,
      account: { select: { id: true, username: true, profilePictureUrl: true } },
      media: { include: { media: true } },
    },
  });
  if (!automation) notFound();

  const [allMedia, funnel, forms] = await Promise.all([
    prisma.media.findMany({
      where: { accountId: automation.accountId },
      orderBy: { timestamp: "desc" },
      take: 60,
      select: {
        id: true,
        caption: true,
        mediaType: true,
        thumbnailUrl: true,
        mediaUrl: true,
        timestamp: true,
      },
    }),
    getFlowFunnel(automation.id),
    prisma.leadForm.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, fields: true },
    }),
  ]);

  // A malformed stored graph must not crash the page — fall back to a bare
  // trigger so the user can rebuild rather than getting a 500.
  const parsed = flowGraphSchema.safeParse({
    nodes: automation.flow?.nodes ?? [],
    edges: automation.flow?.edges ?? [],
  });
  const graph = parsed.success
    ? parsed.data
    : {
        nodes: [
          {
            id: "trigger_recovered",
            type: "TRIGGER" as const,
            position: { x: 0, y: 0 },
            data: { label: "When this happens" },
          },
        ],
        edges: [],
      };

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/dashboard/automations"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All automations
      </Link>

      {isBranded(workspace) && <BrandingNotice />}

      <AutomationEditor
        automation={{
          id: automation.id,
          name: automation.name,
          description: automation.description,
          enabled: automation.enabled,
          triggerType: automation.triggerType,
          scope: automation.scope,
          matchMode: automation.matchMode,
          matchType: automation.matchType,
          keywords: automation.keywords,
          negativeKeywords: automation.negativeKeywords,
          caseSensitive: automation.caseSensitive,
          fuzzyMatch: automation.fuzzyMatch,
          reentryPolicy: automation.reentryPolicy,
          cooldownMinutes: automation.cooldownMinutes,
          mediaIds: automation.media.map((m) => m.mediaId),
          accountUsername: automation.account.username,
        }}
        graph={graph}
        media={allMedia.map((m) => ({ ...m, timestamp: m.timestamp?.toISOString() ?? null }))}
        funnel={funnel}
        graphRecovered={!parsed.success}
        forms={forms.map((f) => ({
          id: f.id,
          name: f.name,
          fields: (Array.isArray(f.fields) ? (f.fields as FormOption["fields"]) : []).filter((q) => q?.id),
        }))}
      />
    </div>
  );
}
