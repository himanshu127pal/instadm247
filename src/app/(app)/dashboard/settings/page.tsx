import { CheckCircle2, XCircle } from "lucide-react";
import { getActiveWorkspace, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, isAiConfigured, isInstagramConfigured } from "@/lib/env";
import { redisAvailable } from "@/lib/redis";
import { Badge } from "@/components/ui";
import { CopyField, PageHeader, SectionCard } from "@/components/dashboard/bits";

export default async function SettingsPage() {
  const [user, workspace, redisUp] = await Promise.all([
    getCurrentUser(),
    getActiveWorkspace(),
    redisAvailable(),
  ]);
  if (!user || !workspace) return null;

  const [accountCount, waitingRuns] = await Promise.all([
    prisma.instagramAccount.count({ where: { workspaceId: workspace.id } }),
    prisma.flowRun.count({
      where: { account: { workspaceId: workspace.id }, status: "waiting" },
    }),
  ]);

  const checks = [
    {
      ok: isInstagramConfigured(),
      label: "Instagram credentials",
      good: "META_APP_ID and META_APP_SECRET are set.",
      bad: "Not set. The app works, but you can't connect an account or send real DMs.",
    },
    {
      ok: redisUp,
      label: "Redis / job queue",
      good: "Connected. Delayed flow steps and broadcasts run on the durable queue.",
      bad: "Not reachable. Webhooks still process inline, but delays longer than a page request need Redis and a running worker.",
    },
    {
      ok: isAiConfigured(),
      label: "AI model",
      good: "ANTHROPIC_API_KEY is set. AI reply steps can generate answers.",
      bad: "Not set. AI steps fall back to your knowledge base article or the fallback message.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        description="Your account, and how this server is configured."
      />

      <SectionCard title="Your account">
        <dl className="space-y-3">
          {[
            ["Name", user.name ?? "—"],
            ["Email", user.email],
            ["Workspace", workspace.name],
            ["Instagram accounts", String(accountCount)],
            ["Flows waiting to resume", String(waitingRuns)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
              <dd className="text-[13.5px] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        title="Server configuration"
        description="Set through environment variables and read at boot."
      >
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2.5">
              {check.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-boom-500)]" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-zonk-500)]" />
              )}
              <div>
                <p className="text-[13.5px] font-medium">
                  {check.label}{" "}
                  <Badge tone={check.ok ? "success" : "warning"}>
                    {check.ok ? "Ready" : "Not set"}
                  </Badge>
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                  {check.ok ? check.good : check.bad}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Meta app URLs"
        description="Paste these into your app on developers.facebook.com."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <CopyField label="OAuth redirect URL" value={env.meta.redirectUri} />
          <CopyField label="Webhook callback URL" value={`${env.appUrl}/api/webhooks/instagram`} />
          <CopyField label="Webhook verify token" value={env.meta.webhookVerifyToken} />
          <CopyField
            label="Deauthorize callback URL"
            value={`${env.appUrl}/api/instagram/deauthorize`}
          />
          <CopyField
            label="Data deletion request URL"
            value={`${env.appUrl}/api/instagram/data-deletion`}
          />
          <CopyField label="Graph API version" value={env.meta.apiVersion} />
        </div>
      </SectionCard>

      <SectionCard title="Sending limits">
        <dl className="space-y-3">
          {[
            [
              "DMs per hour, per account",
              String(env.limits.messagesPerHour),
              "Deliberately under Meta's published ceiling.",
            ],
            [
              "Private replies per hour",
              String(env.limits.privateRepliesPerHour),
              "Replies to comments use a separate allowance.",
            ],
            [
              "Slow Down mode",
              "2 hours",
              "Halves throughput. Armed automatically when Instagram throttles you.",
            ],
          ].map(([label, value, hint]) => (
            <div key={label}>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
                <dd className="text-[13.5px] font-medium tabular-nums">{value}</dd>
              </div>
              <p className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">{hint}</p>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}
