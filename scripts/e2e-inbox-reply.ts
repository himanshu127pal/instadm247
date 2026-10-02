/**
 * Inbox replies against Instagram's real request and error shapes, run from
 * e2e-check.ts. Instagram is stubbed at fetch, so what's asserted is the body
 * that would have left and what the customer is told when it's refused.
 *
 * The bug this guards: every Inbox reply was sent with the HUMAN_AGENT tag,
 * which needs a permission the app may not have; Instagram refused it with
 * error code 10, and we reported every code 10 as "the window had closed",
 * so a reply inside an open window was shown as a window failure.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { encrypt } from "../src/lib/crypto";
import { dispatch } from "../src/lib/engine/dispatch";
import { MetaApiError } from "../src/lib/meta/types";
import { windowCountdown } from "../src/lib/utils";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;
type Mutable = { meta: { appId: string; appSecret: string } };
const mutableEnv = env as unknown as Mutable;

const HOUR = 3_600_000;

export async function runInboxReplyChecks(prisma: PrismaClient, check: Check, section: Section) {
  section("Inbox replies: what Instagram receives");

  // --- Error classification ---------------------------------------------------

  const permission = new MetaApiError("(#10) Application does not have permission for this action", 400, 10);
  const window = new MetaApiError("(#10) This message is sent outside of allowed window.", 400, 10, 2018278);
  const windowText = new MetaApiError("(#10) Message sent outside of the 24 hour window", 400, 10);
  check("a code-10 permission refusal is not reported as a closed window", !permission.isWindowError && permission.isPermissionError);
  check("the window subcode is", window.isWindowError && !window.isPermissionError);
  check("and so is a code 10 that says so", windowText.isWindowError);
  check("Graph's 200-range is a permission refusal", new MetaApiError("(#200) Permissions error", 403, 200).isPermissionError);

  // --- Through the dispatcher, with Instagram stubbed --------------------------

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e reply ${tag}`, slug: `e2e-reply-${tag}`, planKey: "free" },
  });
  const account = await prisma.instagramAccount.create({
    data: {
      workspaceId: workspace.id, igUserId: `e2e_reply_ig_${tag}`, username: `e2e_reply_${tag}`,
      status: "connected", accessTokenEnc: encrypt("e2e-not-a-real-token"),
    },
  });
  const contact = (hoursSinceMessage: number) =>
    prisma.contact.create({
      data: {
        accountId: account.id, igsid: `e2e_reply_${tag}_${hoursSinceMessage}_${randomBytes(2).toString("hex")}`,
        lastInteractionAt: new Date(Date.now() - hoursSinceMessage * HOUR),
        windowExpiresAt: new Date(Date.now() + (24 - hoursSinceMessage) * HOUR),
      },
    });

  const bodies: Array<Record<string, unknown>> = [];
  let refuse: null | { code: number; subcode?: number; message: string } = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    if (String(url).includes("graph.instagram.com")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      bodies.push(body);
      // Instagram, during App Review: an untagged reply in the window is fine,
      // a tagged one is refused because Human Agent hasn't been granted.
      const tagged = body.tag === "HUMAN_AGENT";
      const error = refuse ?? (tagged ? { code: 10, message: "(#10) Application does not have permission for this action" } : null);
      if (error) {
        return new Response(
          JSON.stringify({ error: { message: error.message, type: "OAuthException", code: error.code, error_subcode: error.subcode, fbtrace_id: "e2e" } }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ recipient_id: "r", message_id: `m_${bodies.length}` }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  const saved = { appId: mutableEnv.meta.appId, appSecret: mutableEnv.meta.appSecret };
  mutableEnv.meta.appId = "e2e-app-id";
  mutableEnv.meta.appSecret = "e2e-app-secret";

  const reply = (contactId: string, igsid: string) =>
    dispatch({
      accountId: account.id, contactId, target: { to: "user", igsid },
      message: { kind: "text", text: "typed by a person" }, source: "human", humanAgent: true,
    });

  try {
    const fresh = await contact(0.05);
    const inWindow = await reply(fresh.id, fresh.igsid);
    check(
      "a reply inside the window is sent, even before Instagram grants Human Agent",
      inWindow.status === "sent",
      JSON.stringify(inWindow),
    );
    check(
      "and goes out as an ordinary message, with no tag",
      bodies.at(-1)?.tag === undefined && bodies.at(-1)?.messaging_type === undefined,
      JSON.stringify(bodies.at(-1)),
    );

    const old = await contact(30);
    const late = await reply(old.id, old.igsid);
    check("after 24 hours, the reply asks for the tag", bodies.at(-1)?.tag === "HUMAN_AGENT");
    check(
      "and if Instagram won't allow it, that's a closed window, said plainly",
      late.status === "skipped" && late.reason === "WINDOW_EXPIRED",
      JSON.stringify(late),
    );

    refuse = { code: 10, message: "(#10) Application does not have permission for this action" };
    const denied = await reply(fresh.id, fresh.igsid);
    const stored = await prisma.message.findFirst({ where: { contactId: fresh.id }, orderBy: { createdAt: "desc" } });
    check(
      "a permission refusal inside the window is a failure, not a 'window closed' skip",
      denied.status === "failed" && stored?.status === "failed" && stored.skipReason === null,
      JSON.stringify(denied),
    );
    check(
      "and the customer is told what to check, with Instagram's error code",
      Boolean(stored?.failReason?.includes("Allow access to messages") && stored.failReason.includes("error 10")),
      stored?.failReason ?? "",
    );

    refuse = { code: 10, subcode: 2018278, message: "(#10) This message is sent outside of allowed window." };
    const closed = await reply(fresh.id, fresh.igsid);
    check("a real window error from Instagram is still a window skip", closed.status === "skipped" && closed.reason === "WINDOW_EXPIRED");
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.meta.appId = saved.appId;
    mutableEnv.meta.appSecret = saved.appSecret;
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }

  // --- The countdown --------------------------------------------------------

  section("Inbox: the window countdown");
  // A fixed clock, so the check can't land on a minute boundary.
  const base = Date.UTC(2026, 9, 2, 12, 0, 0);
  const expires = new Date(base + 2 * HOUR);
  check("at the start it shows the full time left", windowCountdown(expires, base).label === "2h 0m left", windowCountdown(expires, base).label);
  check(
    "an hour later the same badge shows an hour less, with no reload",
    windowCountdown(expires, base + 61 * 60_000).label === "59m left",
    windowCountdown(expires, base + 61 * 60_000).label,
  );
  check("and reads closed once it's passed", !windowCountdown(expires, base + 3 * HOUR).open);
}
