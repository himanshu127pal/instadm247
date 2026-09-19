import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { getPlatformStaff } from "@/lib/admin";
import { env, isAiConfigured, isInstagramConfigured, missingInstagramConfig } from "@/lib/env";
import { redisAvailable } from "@/lib/redis";
import { REQUIRED_SCOPES, WEBHOOK_FIELDS } from "@/lib/meta/types";
import { Badge } from "@/components/ui";
import { CopyField } from "@/components/dashboard/bits";

export const dynamic = "force-dynamic";

/**
 * Setup details for *our* Meta app — the one every customer's Instagram account
 * connects through.
 *
 * This used to sit on the customer dashboard, which was a leftover from when
 * the app was something one person self-hosted with their own Meta app. Under
 * the Tech Provider model there is exactly one app and we own it, so these
 * values are ours: at best noise to a customer, and in the verify token's case
 * a shared secret that was being handed to every signed-in browser.
 */
export default async function AdminMetaPage() {
  const staff = await getPlatformStaff();
  const redisUp = await redisAvailable();

  // The verify token is the secret Meta echoes back on webhook verification.
  // Support staff have no reason to hold it, so only admins see it.
  const showSecrets = staff?.role === "admin";

  const checks = [
    {
      ok: isInstagramConfigured(),
      label: "Instagram credentials",
      good: "META_APP_ID and META_APP_SECRET are set.",
      bad: `Missing ${missingInstagramConfig().join(", ") || "credentials"}. No customer can connect an account or send a DM until these are set and the server restarts.`,
    },
    {
      ok: redisUp,
      label: "Redis / job queue",
      good: "Connected. Delayed flow steps and broadcasts run on the durable queue.",
      bad: "Not reachable. Delays, broadcasts and every scheduled maintenance job are stopped.",
    },
    {
      ok: isAiConfigured(),
      label: "AI model",
      good: "ANTHROPIC_API_KEY is set. AI reply steps can generate answers.",
      bad: "Not set. AI steps fall back to the knowledge base article or the fallback message.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[24px] font-extrabold">Meta app</h1>
        <p className="mt-1 text-[13.5px] font-semibold text-[var(--text-muted)]">
          Our single Tech Provider app on developers.facebook.com. Every customer
          connects through it.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <CopyField label="OAuth redirect URL" value={env.meta.redirectUri} />
        <CopyField label="Webhook callback URL" value={`${env.appUrl}/api/webhooks/instagram`} />
        <CopyField
          label="Deauthorize callback URL"
          value={`${env.appUrl}/api/instagram/deauthorize`}
        />
        <CopyField
          label="Data deletion request URL"
          value={`${env.appUrl}/api/instagram/data-deletion`}
        />
        <CopyField label="Graph API version" value={env.meta.apiVersion} />
        {showSecrets ? (
          <CopyField label="Webhook verify token" value={env.meta.webhookVerifyToken} />
        ) : (
          <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--text-faint)]">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Webhook verify token — admins only
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[16px] font-extrabold">Server configuration</h2>
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2.5">
              {check.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-boom-500)]" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-zonk-500)]" />
              )}
              <div>
                <p className="text-[13.5px] font-bold">
                  {check.label}{" "}
                  <Badge tone={check.ok ? "success" : "warning"}>
                    {check.ok ? "Ready" : "Not set"}
                  </Badge>
                </p>
                <p className="mt-0.5 text-[12.5px] font-semibold leading-relaxed text-[var(--text-muted)]">
                  {check.ok ? check.good : check.bad}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-[16px] font-extrabold">Permissions to request</h2>
        <div className="flex flex-wrap gap-1.5">
          {REQUIRED_SCOPES.map((scope) => (
            <Badge key={scope} tone="brand">
              {scope}
            </Badge>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[16px] font-extrabold">Webhook fields to subscribe</h2>
        <div className="flex flex-wrap gap-1.5">
          {WEBHOOK_FIELDS.map((field) => (
            <Badge key={field}>{field}</Badge>
          ))}
        </div>
      </section>

      <p className="max-w-2xl rounded-[var(--radius-card)] border-2 border-[var(--border-soft)] bg-[var(--bg-sunken)] p-3 text-[12.5px] font-semibold leading-relaxed text-[var(--text-muted)]">
        Use <strong className="text-[var(--text)]">API setup with Instagram login</strong> in
        the Instagram use case — no Facebook Page needed. Advanced Access for the messaging
        and comments permissions is required before the app works for accounts that
        don&rsquo;t have a role on it.
      </p>
    </div>
  );
}
