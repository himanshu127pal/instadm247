import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * Native lead destinations — LinkDM's "Connect lead forms to Kit and Flodesk".
 *
 * The generic HTTP_REQUEST flow node could technically do this, but it asks a
 * creator to know what a POST body is. These two are one paste of an API key.
 *
 * Forwarding is best-effort: a subscriber failing to reach Kit must never fail
 * the flow that captured them. Errors are stored on the integration so they're
 * visible rather than silent.
 */

export type LeadPayload = {
  email: string;
  firstName?: string;
  lastName?: string;
  fields?: Record<string, string>;
  tags?: string[];
};

export type ForwardResult = { provider: string; ok: boolean; error?: string };

/** Send a captured lead to every enabled integration in the workspace. */
export async function forwardLead(
  workspaceId: string,
  lead: LeadPayload,
): Promise<ForwardResult[]> {
  if (!lead.email) return [];

  const integrations = await prisma.integration.findMany({
    where: { workspaceId, enabled: true },
  });
  if (integrations.length === 0) return [];

  const results: ForwardResult[] = [];

  for (const integration of integrations) {
    const apiKey = decrypt(integration.apiKeyEnc);
    if (!apiKey) {
      results.push({ provider: integration.provider, ok: false, error: "Credential unreadable" });
      continue;
    }

    try {
      if (integration.provider === "kit") {
        await sendToKit(apiKey, integration.targetId, lead);
      } else if (integration.provider === "flodesk") {
        await sendToFlodesk(apiKey, integration.targetId, lead);
      } else {
        throw new Error(`Unknown provider "${integration.provider}"`);
      }

      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date(), lastError: null },
      });
      results.push({ provider: integration.provider, ok: true });
    } catch (error) {
      const message = (error as Error).message ?? "Unknown error";
      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastError: message },
      });
      results.push({ provider: integration.provider, ok: false, error: message });
      console.warn(`[integrations] ${integration.provider} forward failed:`, message);
    }
  }

  return results;
}

/** Kit (formerly ConvertKit) — subscribe to a form. */
async function sendToKit(apiKey: string, formId: string | null, lead: LeadPayload) {
  if (!formId) throw new Error("No Kit form selected");

  const res = await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      email: lead.email,
      first_name: lead.firstName,
      fields: lead.fields,
      tags: lead.tags,
    }),
  });

  if (!res.ok) throw new Error(`Kit returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Flodesk — upsert a subscriber, then add them to a segment. */
async function sendToFlodesk(apiKey: string, segmentId: string | null, lead: LeadPayload) {
  const auth = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

  const res = await fetch("https://api.flodesk.com/v1/subscribers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      email: lead.email,
      first_name: lead.firstName,
      last_name: lead.lastName,
      custom_fields: lead.fields,
    }),
  });

  if (!res.ok) {
    throw new Error(`Flodesk returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  if (segmentId) {
    const add = await fetch(
      `https://api.flodesk.com/v1/subscribers/${encodeURIComponent(lead.email)}/segments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ segment_ids: [segmentId] }),
      },
    );
    if (!add.ok) {
      throw new Error(`Flodesk segment add returned ${add.status}`);
    }
  }
}

/** Confirm a key works before saving it, so a typo surfaces immediately. */
export async function verifyCredential(provider: string, apiKey: string): Promise<boolean> {
  try {
    if (provider === "kit") {
      const res = await fetch(`https://api.convertkit.com/v3/forms?api_key=${encodeURIComponent(apiKey)}`);
      return res.ok;
    }
    if (provider === "flodesk") {
      const res = await fetch("https://api.flodesk.com/v1/segments", {
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      });
      return res.ok;
    }
  } catch {
    return false;
  }
  return false;
}
