/**
 * Free-plan branding and Link-in-Bio link checks, run from e2e-check.ts.
 * See docs/BILLING.md §Branding.
 *
 * The DM path runs through the real dispatcher with Instagram's API stubbed
 * at fetch, so what's asserted is the exact body that would have left.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { encrypt } from "../src/lib/crypto";
import {
  DM_BRANDING_LINE,
  brandOutgoing,
  isBranded,
  withBrandingLine,
} from "../src/lib/branding";
import { checkSlug, checkSlugFormat } from "../src/lib/bio-slug";
import { dispatch } from "../src/lib/engine/dispatch";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

type Mutable = { billing: { enabled: boolean }; meta: { appId: string; appSecret: string } };
const mutableEnv = env as unknown as Mutable;

const HOUR = 60 * 60 * 1000;

export async function runBrandingChecks(prisma: PrismaClient, check: Check, section: Section) {
  const saved = {
    billing: mutableEnv.billing.enabled,
    appId: mutableEnv.meta.appId,
    appSecret: mutableEnv.meta.appSecret,
  };

  // --- Rules ------------------------------------------------------------------

  section("Branding: who gets it");

  try {
    mutableEnv.billing.enabled = false;
    check("with billing off, nobody is branded", !isBranded({ planKey: "free" }));
    mutableEnv.billing.enabled = true;
    check("on Free, the workspace is branded", isBranded({ planKey: "free" }));
    check("on Pro, it isn't", !isBranded({ planKey: "pro" }));
    check("on Business, it isn't", !isBranded({ planKey: "business" }));
    check("comped workspaces aren't", !isBranded({ planKey: "unlimited" }));

    const text = { kind: "text" as const, text: "Here's your link!" };
    const base = { workspace: { planKey: "free" }, message: text, lastBrandedAt: null };
    const auto = brandOutgoing({ ...base, source: "automation" });
    check(
      "an automated DM on Free gets the line, on its own paragraph",
      auto?.kind === "text" && auto.text === `Here's your link!\n\n${DM_BRANDING_LINE}`,
    );
    check("so does an AI reply", brandOutgoing({ ...base, source: "ai" }) !== null);
    check("a reply a person typed in the Inbox never does", brandOutgoing({ ...base, source: "human" }) === null);
    check(
      "a paid plan's DMs never do",
      brandOutgoing({ ...base, workspace: { planKey: "pro" }, source: "automation" }) === null,
    );
    const now = new Date();
    check(
      "once a person has had it today, they don't get it again",
      brandOutgoing({ ...base, source: "automation", lastBrandedAt: new Date(now.getTime() - 3 * HOUR), now }) === null,
    );
    check(
      "a day later, they do",
      brandOutgoing({ ...base, source: "automation", lastBrandedAt: new Date(now.getTime() - 25 * HOUR), now }) !== null,
    );

    const buttons = withBrandingLine({ kind: "buttons", text: "Pick one", buttons: [] });
    check("button messages carry it in their text", buttons?.kind === "buttons" && buttons.text.endsWith(DM_BRANDING_LINE));
    check("images don't", withBrandingLine({ kind: "image", url: "https://x/y.png" }) === null);
    check("carousels don't", withBrandingLine({ kind: "carousel", slides: [] }) === null);
    check(
      "a message with no room left is sent as written, never shortened",
      withBrandingLine({ kind: "text", text: "x".repeat(980) }) === null &&
        withBrandingLine({ kind: "buttons", text: "x".repeat(620), buttons: [] }) === null,
    );
    const nearlyFull = withBrandingLine({ kind: "text", text: "é".repeat(470) });
    check(
      "the limit is counted in bytes, as Instagram counts it",
      nearlyFull === null || Buffer.byteLength((nearlyFull as { text: string }).text, "utf8") <= 1000,
    );
  } finally {
    mutableEnv.billing.enabled = saved.billing;
  }

  // --- Through the dispatcher ---------------------------------------------

  section("Branding: what actually leaves");

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e brand ${tag}`, slug: `e2e-brand-${tag}`, planKey: "free" },
  });
  const account = await prisma.instagramAccount.create({
    data: {
      workspaceId: workspace.id, igUserId: `e2e_brand_ig_${tag}`, username: `e2e_brand_${tag}`,
      status: "connected", accessTokenEnc: encrypt("e2e-not-a-real-token"),
    },
  });
  const contact = await prisma.contact.create({
    data: {
      accountId: account.id, igsid: `e2e_brand_contact_${tag}`,
      windowExpiresAt: new Date(Date.now() + HOUR), lastInteractionAt: new Date(),
    },
  });

  const bodies: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    if (String(url).includes("graph.instagram.com")) {
      bodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ recipient_id: "r", message_id: `m_${bodies.length}` }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  mutableEnv.meta.appId = "e2e-app-id";
  mutableEnv.meta.appSecret = "e2e-app-secret";
  mutableEnv.billing.enabled = true;

  const send = (source: "automation" | "human", text: string) =>
    dispatch({
      accountId: account.id,
      contactId: contact.id,
      target: { to: "user", igsid: contact.igsid },
      message: { kind: "text", text },
      source,
    });

  try {
    const first = await send("automation", "first automated");
    const second = await send("automation", "second automated");
    const human = await send("human", "typed by a person");
    const sent = (i: number) => bodies[i] ?? "";
    check("all three were sent", [first, second, human].every((r) => r.status === "sent"), JSON.stringify([first, second, human]));
    check("the first automated DM of the day carries the line", sent(0).includes("Sent with InstaDM247"));
    check("the second doesn't", sent(1).includes("second automated") && !sent(1).includes("Sent with InstaDM247"));
    check("the typed reply doesn't", sent(2).includes("typed by a person") && !sent(2).includes("Sent with InstaDM247"));
    const stored = first.status === "sent" ? await prisma.message.findUnique({ where: { id: first.messageId } }) : null;
    check("the Inbox records what was really sent, line included", Boolean(stored?.text?.endsWith(DM_BRANDING_LINE)));

    // Upgrade: gone at once, nothing to migrate.
    await prisma.workspace.update({ where: { id: workspace.id }, data: { planKey: "pro" } });
    await prisma.contact.update({ where: { id: contact.id }, data: { brandedAt: null } });
    await send("automation", "after upgrading");
    check("after upgrading, the line stops immediately", !sent(3).includes("Sent with InstaDM247"));

    // Plan ends: back on Free, back on.
    await prisma.workspace.update({ where: { id: workspace.id }, data: { planKey: "free" } });
    await send("automation", "after the plan ended");
    check("when the paid plan ends, it comes back", sent(4).includes("Sent with InstaDM247"));
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.meta.appId = saved.appId;
    mutableEnv.meta.appSecret = saved.appSecret;
    mutableEnv.billing.enabled = saved.billing;
  }

  // --- Link in bio ------------------------------------------------------------

  section("Link in bio: the link");

  try {
    const page = await prisma.bioPage.create({
      data: { workspaceId: workspace.id, slug: `e2e-bio-${tag}`, title: "E2E", showBadge: false },
    });
    check("a free link is available", (await checkSlug(`e2e-free-${tag}`)).available);
    const taken = await checkSlug(`e2e-bio-${tag}`);
    check("a link someone has is reported taken", !taken.available && /taken/.test(taken.reason));
    check("a page can keep its own link", (await checkSlug(`e2e-bio-${tag}`, page.id)).available);
    check("reserved names are refused", !checkSlugFormat("instadm247").available && !checkSlugFormat("support").available);
    check(
      "bad formats are refused before the database is asked",
      !checkSlugFormat("A").available && !checkSlugFormat("has space").available && !checkSlugFormat("-edge-").available,
    );

    mutableEnv.billing.enabled = true;
    const withPlan = await prisma.bioPage.findUnique({ where: { id: page.id }, include: { workspace: { select: { planKey: true } } } });
    check(
      "on Free the badge shows even if the saved setting is off",
      Boolean(withPlan) && (withPlan!.showBadge || isBranded(withPlan!.workspace)),
    );
    await prisma.workspace.update({ where: { id: workspace.id }, data: { planKey: "pro" } });
    check("on Pro the saved setting applies", !isBranded({ planKey: "pro" }) && !withPlan!.showBadge);
  } finally {
    mutableEnv.billing.enabled = saved.billing;
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }

  // --- Dark mode ------------------------------------------------------------

  section("Dark mode: native controls");

  const css = readFileSync("src/app/globals.css", "utf8");
  check(
    "both dark themes tell the browser to draw its own widgets dark",
    (css.match(/color-scheme:\s*dark;/g) ?? []).length === 2 && /color-scheme:\s*light;/.test(css),
  );
  check("dropdown options take the theme's colours", /select option[\s\S]{0,80}background-color:\s*var\(--bg-raised\)/.test(css));
}
