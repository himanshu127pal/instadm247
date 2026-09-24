/**
 * End-to-end engine check.
 *
 * Drives a real comment webhook through the full pipeline — signature
 * verification, parsing, trigger matching, flow execution, dispatch guards —
 * against a live database, and asserts the safety rules actually hold.
 *
 *   pnpm e2e
 */

import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { verifyMetaSignature } from "../src/lib/crypto";
import { parseWebhook } from "../src/lib/meta/webhooks";
import { accountIdForEntry, handleEvent } from "../src/lib/engine/ingest";
import { byEitherInstagramId } from "../src/lib/meta/identity";
import { resumeJobId } from "../src/lib/engine/run";
import { getQueue } from "../src/lib/engine/queues";
import { runBillingChecks } from "./e2e-billing";
import { runEmailChecks } from "./e2e-email";
import { runRefundChecks } from "./e2e-refund";
import { runBrandingChecks } from "./e2e-branding";
import { runContentChecks } from "./e2e-content";
import { runSheetsChecks } from "./e2e-sheets";
import { runParityChecks } from "./e2e-parity";
import { evaluateKeywords, matchesKeyword, normalizeText } from "../src/lib/engine/match";
import { claimCommentReply, isOptOutMessage } from "../src/lib/engine/guards";
import { cumulativeDelayMinutes, flowGraphSchema, validateGraph } from "../src/lib/engine/schema";
import { PRESETS } from "../src/lib/engine/presets";
import { captionContainsCode, generateDraftCode } from "../src/lib/engine/planner";
import { addCodes, generateCodes, issueCoupon, poolStats } from "../src/lib/engine/coupons";
import { createApiKey, authenticateApiKey, hashKey } from "../src/lib/api-keys";
import { CORE_WEBHOOK_FIELDS, WEBHOOK_FIELDS } from "../src/lib/meta/types";
import { InstagramClient } from "../src/lib/meta/client";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

/**
 * Webhook fixtures mirror Meta's raw JSON, which is deliberately untyped here —
 * the whole point is to feed the parser exactly what Instagram would send.
 */
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function fixture(value: unknown): Json {
  return structuredClone(value) as Json;
}

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  const APP_SECRET = "test-app-secret";

  // --- 1. Webhook signature verification -----------------------------------

  section("Webhook signature");
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const goodSig = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");

  check("valid signature accepted", verifyMetaSignature(body, goodSig, APP_SECRET));
  check("wrong signature rejected", !verifyMetaSignature(body, "sha256=deadbeef", APP_SECRET));
  check("missing signature rejected", !verifyMetaSignature(body, null, APP_SECRET));
  check(
    "tampered body rejected",
    !verifyMetaSignature(body + " ", goodSig, APP_SECRET),
  );

  // --- 2. Payload parsing ---------------------------------------------------

  section("Webhook parsing");

  const account = await prisma.instagramAccount.findFirst({ where: { status: "demo" } });
  if (!account) throw new Error("Run `pnpm db:seed` first.");

  const commentPayload = {
    object: "instagram",
    entry: [
      {
        id: account.igUserId,
        time: Date.now(),
        changes: [
          {
            field: "comments",
            value: {
              id: `e2e_comment_${Date.now()}`,
              from: { id: "e2e_user_1", username: "e2e.tester" },
              media: { id: "demo_media_2", media_product_type: "FEED" },
              text: "LINK please!",
            },
          },
        ],
      },
    ],
  };

  const parsedComment = parseWebhook(commentPayload);
  check("comment produces one event", parsedComment.events.length === 1);
  check("comment kind is COMMENT", parsedComment.events[0]?.kind === "COMMENT");
  check("comment id captured", Boolean(parsedComment.events[0]?.commentId));

  // Ads posts get their own trigger kind.
  const adPayload = fixture(commentPayload);
  adPayload.entry[0].changes[0].value.media.ad_id = "ad_123";
  adPayload.entry[0].changes[0].value.id = `e2e_ad_comment_${Date.now()}`;
  check("ad comment detected", parseWebhook(adPayload).events[0]?.kind === "AD_COMMENT");

  // Story mention arrives as a message attachment.
  const mentionPayload = {
    object: "instagram",
    entry: [
      {
        id: account.igUserId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: "e2e_user_2" },
            recipient: { id: account.igUserId },
            timestamp: Date.now(),
            message: {
              mid: `e2e_mid_${Date.now()}`,
              attachments: [{ type: "story_mention", payload: { url: "https://x" } }],
            },
          },
        ],
      },
    ],
  };
  check(
    "story mention detected",
    parseWebhook(mentionPayload).events[0]?.kind === "STORY_MENTION",
  );

  // Story reply carries reply_to.story.
  const replyPayload = fixture(mentionPayload);
  replyPayload.entry[0].messaging[0].message = {
    mid: `e2e_mid_r_${Date.now()}`,
    text: "where's this from?",
    reply_to: { story: { id: "story_1", url: "https://x" } },
  };
  check("story reply detected", parseWebhook(replyPayload).events[0]?.kind === "STORY_REPLY");

  // Our own echoes must never become triggers.
  const echoPayload = fixture(mentionPayload);
  echoPayload.entry[0].messaging[0].message = { mid: "echo_1", text: "hi", is_echo: true };
  const echoParsed = parseWebhook(echoPayload);
  check("echo is not a trigger", echoParsed.events.length === 0);
  check("echo recorded as a side effect", echoParsed.effects[0]?.type === "echo");

  // Read receipts drive the "opened" metric.
  const readPayload = fixture(mentionPayload);
  readPayload.entry[0].messaging[0] = {
    sender: { id: "e2e_user_2" },
    recipient: { id: account.igUserId },
    timestamp: Date.now(),
    read: { mid: "m1" },
  };
  check("read receipt parsed", parseWebhook(readPayload).effects[0]?.type === "message_seen");

  // --- 3. Keyword matching --------------------------------------------------

  section("Keyword matching");

  const base = { matchType: "CONTAINS", caseSensitive: false, fuzzy: false };
  check("case insensitive", matchesKeyword("Send me the LINK", "link", base));
  check("emoji tolerated", matchesKeyword("LINK 🙏🏽✨", "link", base));
  check("accents normalised", matchesKeyword("Envíame el LÍNK", "link", base));
  check("substring not a false match", !matchesKeyword("I use linkedin daily", "link", base));
  check("shop does not fire on shopping", !matchesKeyword("love shopping here", "shop", base));
  check("elongated keyword still matches", matchesKeyword("LINKKKK", "link", base));
  check("keyword mid-sentence matches", matchesKeyword("can I get the link please", "link", base));
  check("multi-word keyword matches", matchesKeyword("send the price list now", "price list", base));
  check(
    "exact mode is exact",
    matchesKeyword("link", "link", { ...base, matchType: "EXACT" }) &&
      !matchesKeyword("the link", "link", { ...base, matchType: "EXACT" }),
  );
  check(
    "typo tolerance when enabled",
    matchesKeyword("send the recipie", "recipe", { ...base, fuzzy: true }),
  );
  check(
    "short words get no typo tolerance",
    !matchesKeyword("stop", "shop", { ...base, fuzzy: true }),
  );
  check(
    "invalid regex never throws or matches",
    !matchesKeyword("anything", "([", { ...base, matchType: "REGEX" }),
  );
  check("normalizeText collapses noise", normalizeText("  HÉY!!  there ") === "hey there");

  const automationRule = {
    matchMode: "KEYWORD",
    keywords: ["link"],
    negativeKeywords: ["refund"],
    matchType: "CONTAINS",
    caseSensitive: false,
    fuzzyMatch: false,
  };
  check("keyword matches", evaluateKeywords("send LINK", automationRule).matched);
  check(
    "negative keyword vetoes",
    !evaluateKeywords("link for my refund", automationRule).matched,
  );
  check(
    "negative keyword vetoes even in ALL mode",
    !evaluateKeywords("refund please", { ...automationRule, matchMode: "ALL" }).matched,
  );

  // --- 4. Opt-out detection -------------------------------------------------

  section("Opt-out handling");
  check("STOP detected", isOptOutMessage("STOP"));
  check("unsubscribe detected", isOptOutMessage("Unsubscribe"));
  check("stop with punctuation detected", isOptOutMessage("stop."));
  check(
    "'stop' inside a sentence is not an opt-out",
    !isOptOutMessage("Please don't stop posting these, they're great"),
  );

  // --- 5. Flow graph validation --------------------------------------------

  section("Flow validation");

  for (const preset of PRESETS) {
    const graph = preset.build();
    const parsed = flowGraphSchema.safeParse(graph);
    check(`preset "${preset.name}" is a valid graph`, parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues[0]));
    if (parsed.success) {
      const errors = validateGraph(parsed.data).filter((i) => i.level === "error");
      check(`preset "${preset.name}" has no blocking errors`, errors.length === 0, errors[0]?.message);
    }
  }

  // A flow whose delays exceed the 24h window must be rejected.
  const tooLong = {
    nodes: [
      { id: "t", type: "TRIGGER", position: { x: 0, y: 0 }, data: { label: "T" } },
      { id: "d1", type: "DELAY", position: { x: 0, y: 1 }, data: { label: "D1", minutes: 1400 } },
      { id: "d2", type: "DELAY", position: { x: 0, y: 2 }, data: { label: "D2", minutes: 200 } },
    ],
    edges: [
      { id: "e1", source: "t", target: "d1", sourceHandle: "next" },
      { id: "e2", source: "d1", target: "d2", sourceHandle: "next" },
    ],
  };
  const parsedLong = flowGraphSchema.parse(tooLong);
  check("cumulative delay computed", cumulativeDelayMinutes(parsedLong) === 1600);
  check(
    "flow exceeding the 24h window is an error",
    validateGraph(parsedLong).some(
      (i) => i.level === "error" && i.message.includes("24h"),
    ),
  );
  check(
    "delay over 24h rejected by the schema",
    !flowGraphSchema.safeParse({
      nodes: [
        { id: "t", type: "TRIGGER", position: { x: 0, y: 0 }, data: { label: "T" } },
        { id: "d", type: "DELAY", position: { x: 0, y: 1 }, data: { label: "D", minutes: 5000 } },
      ],
      edges: [],
    }).success,
  );

  // --- 6. One private reply per comment ------------------------------------

  section("One private reply per comment");

  const commentId = `e2e_claim_${Date.now()}`;
  const first = await claimCommentReply(account.id, commentId);
  const second = await claimCommentReply(account.id, commentId);
  check("first claim wins", first);
  check("second claim refused", !second);

  // Concurrent claims — the case a duplicate webhook actually produces.
  const raceId = `e2e_race_${Date.now()}`;
  const results = await Promise.all(
    Array.from({ length: 8 }, () => claimCommentReply(account.id, raceId)),
  );
  check(
    "exactly one claim wins under concurrency",
    results.filter(Boolean).length === 1,
    `${results.filter(Boolean).length} won`,
  );

  // --- 7. DM Planner draft codes -------------------------------------------

  section("DM Planner");
  const code = generateDraftCode();
  check("draft code has the DM- prefix", /^DM-[A-Z2-9]{6}$/.test(code));
  check("code found in a caption", captionContainsCode(`New drop today! ${code} #ad`, code));
  check("code matched case-insensitively", captionContainsCode(`x ${code.toLowerCase()} y`, code));
  check("absent code not matched", !captionContainsCode("No code here", code));

  // --- 8. Full pipeline: comment → flow run → message -----------------------

  section("Full pipeline");

  const liveAutomation = await prisma.automation.findFirst({
    where: { accountId: account.id, enabled: true, keywords: { has: "LINK" } },
  });
  check("a LINK automation exists", Boolean(liveAutomation));

  if (liveAutomation) {
    const igsid = `e2e_pipeline_${Date.now()}`;
    const event = parseWebhook({
      object: "instagram",
      entry: [
        {
          id: account.igUserId,
          time: Date.now(),
          changes: [
            {
              field: "comments",
              value: {
                id: `e2e_pipe_comment_${Date.now()}`,
                from: { id: igsid, username: "pipeline.tester" },
                media: { id: "demo_media_2" },
                text: "LINK please!!",
              },
            },
          ],
        },
      ],
    }).events[0];

    await handleEvent(event);

    const contact = await prisma.contact.findUnique({
      where: { accountId_igsid: { accountId: account.id, igsid } },
    });
    check("contact created from the comment", Boolean(contact));
    check(
      "24h messaging window opened",
      Boolean(contact?.windowExpiresAt && contact.windowExpiresAt > new Date()),
    );

    const run = contact
      ? await prisma.flowRun.findFirst({
          where: { contactId: contact.id },
          orderBy: { startedAt: "desc" },
        })
      : null;
    check("flow run started", Boolean(run));

    const messages = contact
      ? await prisma.message.findMany({ where: { contactId: contact.id } })
      : [];
    check("inbound comment recorded", messages.some((m) => m.direction === "inbound"));
    check(
      "outbound DM produced",
      messages.some((m) => m.direction === "outbound" && m.status === "sent"),
      messages.map((m) => `${m.direction}:${m.status}${m.skipReason ? `(${m.skipReason})` : ""}`).join(", "),
    );

    // Replaying the identical event must not produce a second DM.
    const beforeReplay = messages.filter((m) => m.direction === "outbound").length;
    await handleEvent(event);
    const afterReplay = contact
      ? await prisma.message.count({ where: { contactId: contact.id, direction: "outbound" } })
      : 0;
    check(
      "replayed webhook does not double-send",
      afterReplay === beforeReplay,
      `${beforeReplay} → ${afterReplay}`,
    );
  }

  // --- 9. Window enforcement ------------------------------------------------

  section("Messaging window enforcement");

  const staleIgsid = `e2e_stale_${Date.now()}`;
  const staleContact = await prisma.contact.create({
    data: {
      accountId: account.id,
      igsid: staleIgsid,
      username: "stale.tester",
      // Interacted three days ago — the window is long closed.
      lastInteractionAt: new Date(Date.now() - 3 * 86_400_000),
      windowExpiresAt: new Date(Date.now() - 2 * 86_400_000),
    },
  });

  const { dispatch } = await import("../src/lib/engine/dispatch");
  const staleResult = await dispatch({
    accountId: account.id,
    contactId: staleContact.id,
    target: { to: "user", igsid: staleIgsid },
    message: { kind: "text", text: "This should not send." },
    source: "automation",
  });
  check(
    "send outside the window is skipped",
    staleResult.status === "skipped" && staleResult.reason === "WINDOW_EXPIRED",
    JSON.stringify(staleResult),
  );

  // Opted-out contacts are never messaged by automation.
  const optedOut = await prisma.contact.create({
    data: {
      accountId: account.id,
      igsid: `e2e_optout_${Date.now()}`,
      username: "optout.tester",
      lastInteractionAt: new Date(),
      windowExpiresAt: new Date(Date.now() + 3_600_000),
      optedOut: true,
    },
  });
  const optOutResult = await dispatch({
    accountId: account.id,
    contactId: optedOut.id,
    target: { to: "user", igsid: optedOut.igsid },
    message: { kind: "text", text: "This should not send either." },
    source: "automation",
  });
  check(
    "opted-out contact is skipped",
    optOutResult.status === "skipped" && optOutResult.reason === "OPTED_OUT",
    JSON.stringify(optOutResult),
  );

  // --- 10. HUMAN_AGENT tag discipline --------------------------------------

  section("HUMAN_AGENT tag discipline");

  const tagContact = await prisma.contact.create({
    data: {
      accountId: account.id,
      igsid: `e2e_tag_${Date.now()}`,
      username: "tag.tester",
      lastInteractionAt: new Date(),
      windowExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  // Automation asking for the tag must not get it.
  await dispatch({
    accountId: account.id,
    contactId: tagContact.id,
    target: { to: "user", igsid: tagContact.igsid },
    message: { kind: "text", text: "automation message" },
    source: "automation",
    humanAgent: true,
  });
  // A real human reply gets it.
  await dispatch({
    accountId: account.id,
    contactId: tagContact.id,
    target: { to: "user", igsid: tagContact.igsid },
    message: { kind: "text", text: "human message" },
    source: "human",
    humanAgent: true,
  });

  const tagged = await prisma.message.findMany({
    where: { contactId: tagContact.id, direction: "outbound" },
  });
  check(
    "automation never carries the HUMAN_AGENT tag",
    tagged.filter((m) => m.source === "automation").every((m) => !m.humanAgentTag),
  );
  check(
    "a human reply does carry it",
    tagged.filter((m) => m.source === "human").every((m) => m.humanAgentTag),
  );

  // --- 11. Coupons ----------------------------------------------------------

  section("DM Coupons");

  const workspace = await prisma.workspace.findFirst();
  if (!workspace) throw new Error("No workspace — run `pnpm db:seed`.");

  const pool = await prisma.couponPool.create({
    data: { workspaceId: workspace.id, name: `e2e pool ${Date.now()}`, mode: "UNIQUE" },
  });

  const generated = generateCodes("E2E", 5);
  check("generated codes are unique", new Set(generated).size === 5);
  check("generated codes carry the prefix", generated.every((c) => c.startsWith("E2E-")));

  const added = await addCodes(pool.id, generated.join("\n"));
  check("codes loaded into the pool", added === 5, `added ${added}`);

  const dupes = await addCodes(pool.id, generated.join("\n"));
  check("re-adding the same codes is a no-op", dupes === 0, `added ${dupes}`);

  const couponContact = await prisma.contact.create({
    data: {
      accountId: account.id,
      igsid: `e2e_coupon_${Date.now()}`,
      username: "coupon.tester",
      lastInteractionAt: new Date(),
      windowExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  const firstIssue = await issueCoupon(pool.id, couponContact.id);
  check("a code is issued", firstIssue.ok === true);

  const secondIssue = await issueCoupon(pool.id, couponContact.id);
  check(
    "the same contact gets the same code back, not a new one",
    secondIssue.ok === true &&
      firstIssue.ok === true &&
      secondIssue.code === firstIssue.code &&
      secondIssue.reused,
  );

  // Concurrency: four different people racing for the four remaining codes.
  const racers = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      prisma.contact.create({
        data: {
          accountId: account.id,
          igsid: `e2e_coupon_race_${Date.now()}_${i}`,
          username: `racer${i}`,
          lastInteractionAt: new Date(),
          windowExpiresAt: new Date(Date.now() + 3_600_000),
        },
      }),
    ),
  );
  const raceResults = await Promise.all(racers.map((c) => issueCoupon(pool.id, c.id)));
  const issuedCodes = raceResults.filter((r) => r.ok).map((r) => (r.ok ? r.code : ""));
  check(
    "concurrent issues never hand out the same code",
    new Set(issuedCodes).size === issuedCodes.length,
    issuedCodes.join(", "),
  );

  const exhausted = await prisma.contact.create({
    data: {
      accountId: account.id,
      igsid: `e2e_coupon_empty_${Date.now()}`,
      username: "toolate",
      lastInteractionAt: new Date(),
      windowExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const empty = await issueCoupon(pool.id, exhausted.id);
  check("an empty pool reports pool_empty", !empty.ok && empty.reason === "pool_empty");

  const stats = await poolStats(pool.id);
  check("pool stats add up", stats.total === 5 && stats.issued === 5 && stats.remaining === 0);

  const shared = await prisma.couponPool.create({
    data: {
      workspaceId: workspace.id,
      name: `e2e shared ${Date.now()}`,
      mode: "SHARED",
      sharedCode: "SPRING20",
    },
  });
  const sharedA = await issueCoupon(shared.id, couponContact.id);
  const sharedB = await issueCoupon(shared.id, exhausted.id);
  check(
    "a shared pool gives everyone the same code",
    sharedA.ok && sharedB.ok && sharedA.code === "SPRING20" && sharedB.code === "SPRING20",
  );

  const expiredPool = await prisma.couponPool.create({
    data: {
      workspaceId: workspace.id,
      name: `e2e expired ${Date.now()}`,
      mode: "SHARED",
      sharedCode: "OLD",
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  const expiredIssue = await issueCoupon(expiredPool.id, couponContact.id);
  check("an expired pool refuses to issue", !expiredIssue.ok && expiredIssue.reason === "expired");

  // --- 12. Public API keys ---------------------------------------------------

  section("Public API keys");

  const created = await createApiKey(workspace.id, "e2e key", ["read"]);
  check("key uses the live prefix", created.key.startsWith("idm_live_"));

  const stored = await prisma.apiKey.findUnique({ where: { id: created.id } });
  check("plaintext key is never stored", stored?.keyHash !== created.key);
  check("stored hash matches the key", stored?.keyHash === hashKey(created.key));

  const goodAuth = await authenticateApiKey(
    new Request("https://x", { headers: { authorization: `Bearer ${created.key}` } }),
  );
  check("a valid key authenticates", goodAuth?.workspaceId === workspace.id);
  check("scopes come back", goodAuth?.scopes.includes("read") === true);

  const badAuth = await authenticateApiKey(
    new Request("https://x", { headers: { authorization: "Bearer idm_live_wrong" } }),
  );
  check("an invalid key is rejected", badAuth === null);

  const noAuth = await authenticateApiKey(new Request("https://x"));
  check("a missing header is rejected", noAuth === null);

  await prisma.apiKey.update({ where: { id: created.id }, data: { revokedAt: new Date() } });
  const revokedAuth = await authenticateApiKey(
    new Request("https://x", { headers: { authorization: `Bearer ${created.key}` } }),
  );
  check("a revoked key stops working", revokedAuth === null);

  // --- Admin panel guards ----------------------------------------------------
  // Suspension and impersonation both have to be enforced at the dispatcher,
  // not merely in the UI: the whole point of suspending a customer is that
  // traffic stops leaving on Meta's API under our app.
  section("Admin panel guards");
  {
    const igsid = `e2e_admin_${Date.now()}`;
    const subject = await prisma.contact.create({
      data: {
        accountId: account.id,
        igsid,
        // Open window, so a refusal below is the guard under test and not the
        // 24-hour rule.
        windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastInteractionAt: new Date(),
      },
    });

    const send = (extra: Partial<Parameters<typeof dispatch>[0]> = {}) =>
      dispatch({
        accountId: account.id,
        contactId: subject.id,
        target: { to: "user", igsid },
        message: { kind: "text", text: "e2e admin guard" },
        source: "automation",
        ...extra,
      });

    const baseline = await send();
    check(
      "sends are possible before suspension",
      !(baseline.status === "skipped" && baseline.reason === "WORKSPACE_SUSPENDED"),
    );

    await prisma.workspace.update({
      where: { id: account.workspaceId },
      data: { suspendedAt: new Date(), suspendedReason: "e2e suspension" },
    });

    const auto = await send();
    check(
      "a suspended workspace cannot send automation",
      auto.status === "skipped" && auto.reason === "WORKSPACE_SUSPENDED",
    );

    const human = await send({ source: "human" });
    check(
      "suspension has no exception for human replies",
      human.status === "skipped" && human.reason === "WORKSPACE_SUSPENDED",
    );

    await prisma.workspace.update({
      where: { id: account.workspaceId },
      data: { suspendedAt: null, suspendedReason: null, suspendedById: null },
    });

    const restored = await send();
    check(
      "lifting a suspension restores sending",
      !(restored.status === "skipped" && restored.reason === "WORKSPACE_SUSPENDED"),
    );

    // An Inbox reply carries Meta's HUMAN_AGENT tag, which asserts a human
    // wrote it. Support viewing the account is not that human.
    const impersonated = await send({ source: "human", viaImpersonation: true });
    check(
      "a support session cannot send as the customer",
      impersonated.status === "skipped" && impersonated.reason === "IMPERSONATED_SESSION",
    );

    await prisma.contact.delete({ where: { id: subject.id } }).catch(() => undefined);
  }

  section("Deauthorize and data deletion");
  {
    // Meta's signed request on these callbacks carries the app-scoped ID, while
    // webhooks carry the professional account ID. Matching only one means the
    // callback silently does nothing — and for deletion, answers "deleted"
    // while deleting nothing, which is the worst way to fail a compliance path.
    const scoped = `e2e_del_scoped_${Date.now()}`;
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { igScopedId: scoped },
    });

    const viaScoped = await prisma.instagramAccount.findMany({
      where: byEitherInstagramId(scoped),
      select: { id: true },
    });
    check(
      "a callback carrying the app-scoped id finds the account",
      viaScoped.length === 1 && viaScoped[0]?.id === account.id,
    );

    const viaReal = await prisma.instagramAccount.findMany({
      where: byEitherInstagramId(account.igUserId),
      select: { id: true },
    });
    check(
      "a callback carrying the professional id finds the same account",
      viaReal.length === 1 && viaReal[0]?.id === account.id,
    );

    const viaOther = await prisma.instagramAccount.findMany({
      where: byEitherInstagramId("e2e_nobody"),
      select: { id: true },
    });
    check("a callback for an unknown id matches nothing", viaOther.length === 0);

    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { igScopedId: null },
    });
  }

  section("Webhook delivery log");
  {
    const { listWebhookEvents, webhookSummary } = await import("../src/lib/admin-queries");

    // Intake records the delivery before anything is processed, so its account
    // match has to agree with the processor's. If intake files an event as
    // unmatched that the processor would have matched, the admin log accuses
    // the wrong thing and sends someone chasing a phantom.
    const scoped = `e2e_log_scoped_${Date.now()}`;
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { igScopedId: scoped },
    });

    check(
      "intake matches on the professional account ID",
      (await accountIdForEntry(account.igUserId)) === account.id,
    );
    check(
      "intake matches on the app-scoped ID too",
      (await accountIdForEntry(scoped)) === account.id,
    );
    check(
      "intake reports no match for an unknown id",
      (await accountIdForEntry("e2e_unknown_entry_id")) === null,
    );

    // An unmatched delivery must still be stored: it is the only evidence that
    // Instagram is sending anything at all.
    const orphan = await prisma.webhookEvent.create({
      data: {
        accountId: null,
        dedupeKey: `e2e_orphan_${Date.now()}`,
        field: "comments",
        payload: { event: { note: "e2e" } } as object,
      },
    });

    const unmatched = await listWebhookEvents({ state: "unmatched", limit: 50 });
    check(
      "an unmatched delivery is listed, not dropped",
      unmatched.some((r) => r.id === orphan.id),
    );
    check(
      "an unmatched delivery reports no customer",
      unmatched.find((r) => r.id === orphan.id)?.workspaceId === null,
    );

    const scopedToAccount = await listWebhookEvents({ accountId: account.id, limit: 50 });
    check(
      "filtering by account excludes other customers' deliveries",
      scopedToAccount.every((r) => r.accountId === account.id),
    );

    const summary = await webhookSummary();
    check("the summary counts the unmatched delivery", summary.unmatched >= 1);

    await prisma.webhookEvent.delete({ where: { id: orphan.id } }).catch(() => undefined);
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { igScopedId: null },
    });
  }

  section("Instagram account identity");
  {
    // Instagram Login issues two IDs. The token exchange returns the app-scoped
    // one; Graph calls and webhook payloads use the professional account ID
    // from /me. Storing the wrong one fails two ways: subscribed_apps is
    // refused outright, and any webhook that did arrive matches no account and
    // is dropped without a trace.
    const scoped = `e2e_scoped_${Date.now()}`;
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { igScopedId: scoped },
    });

    const viaReal = await prisma.instagramAccount.findFirst({
      where: { OR: [{ igUserId: account.igUserId }, { igScopedId: account.igUserId }] },
    });
    check("an event carrying the professional account ID resolves", viaReal?.id === account.id);

    const viaScoped = await prisma.instagramAccount.findFirst({
      where: { OR: [{ igUserId: scoped }, { igScopedId: scoped }] },
    });
    check("an event carrying the app-scoped ID resolves to the same account", viaScoped?.id === account.id);

    const viaNeither = await prisma.instagramAccount.findFirst({
      where: { OR: [{ igUserId: "e2e_not_a_real_id" }, { igScopedId: "e2e_not_a_real_id" }] },
    });
    check("an unknown id still matches nothing", viaNeither === null);

    // subscribed_apps must be addressed as `me`: the app-scoped ID is refused
    // with "Object with ID … does not exist", which is what sent us here.
    const paths: string[] = [];
    const probe = new InstagramClient("token", "28762102583480360");
    (probe as unknown as { request: (p: string, i?: unknown) => Promise<unknown> }).request =
      async (path: string) => {
        paths.push(path);
        return { success: true };
      };
    await probe.subscribeWebhooks();
    check("subscribe addresses /me, not the stored id", paths[0] === "/me/subscribed_apps");

    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { igScopedId: null },
    });
  }

  section("Webhook subscription fallback");
  {
    // Meta validates subscribed_fields as a set: one field the app has not
    // enabled fails the whole call, and the account then receives nothing at
    // all. The fallback probes each field so the account keeps everything that
    // does work, rather than collapsing to the core two.
    check(
      "the core set is a subset of the full field list",
      CORE_WEBHOOK_FIELDS.every((f) => (WEBHOOK_FIELDS as readonly string[]).includes(f)),
    );
    check(
      "the core set covers both comment and DM triggers",
      CORE_WEBHOOK_FIELDS.includes("comments") && CORE_WEBHOOK_FIELDS.includes("messages"),
    );

    // Stand in for the network: this app has not enabled messaging_handover,
    // so any request containing it fails — exactly how Meta behaves.
    const BAD = "messaging_handover";
    function clientRefusing(bad: string[]) {
      const attempts: string[][] = [];
      const client = new InstagramClient("token", "igid");
      (client as unknown as { subscribeWebhooks: (f: readonly string[]) => Promise<unknown> })
        .subscribeWebhooks = async (fields: readonly string[]) => {
        attempts.push([...fields]);
        if (fields.some((f) => bad.includes(f))) {
          throw new Error(`(#100) ${bad.join(", ")} is not enabled for this app`);
        }
        return { success: true };
      };
      return { client, attempts };
    }

    const { client, attempts } = clientRefusing([BAD]);
    const result = await client.subscribeWebhooksWithFallback();

    check("the full list is tried first", attempts[0]?.length === WEBHOOK_FIELDS.length);
    check("the fallback reports itself as degraded", result.degraded === true);
    check("the refused field is named", result.refused.join() === BAD);
    check(
      "every other field is kept, not just the core two",
      result.fields.length === WEBHOOK_FIELDS.length - 1 && !result.fields.includes(BAD),
    );
    check(
      "the subscription ends on the full accepted set",
      attempts[attempts.length - 1]?.join() === result.fields.join(),
    );
    check(
      "the fallback keeps Meta's reason for the operator",
      (result.fullListError ?? "").includes(BAD),
    );

    // Several refused fields, to be sure the probe is not finding only the first.
    const multi = clientRefusing(["messaging_handover", "messaging_seen"]);
    const multiResult = await multi.client.subscribeWebhooksWithFallback();
    check(
      "several refused fields are all found",
      multiResult.refused.length === 2 &&
        multiResult.fields.length === WEBHOOK_FIELDS.length - 2,
    );

    check(
      "each refused field keeps its own reason",
      multiResult.reasons["messaging_handover"]?.includes("messaging_handover") === true &&
        multiResult.reasons["messaging_seen"]?.includes("messaging_seen") === true,
    );

    // Every name we ask for must be one Instagram Login actually offers. One
    // invalid name fails the whole subscription and takes the valid fields down
    // with it, which is how connected accounts ended up on two fields.
    const OFFERED = new Set([
      "agent_messages", "messages", "messaging_postbacks", "messaging_seen",
      "messaging_handover", "messaging_referral", "messaging_optins",
      "message_reactions", "message_edit", "standby", "comments", "live_comments",
      "mentions", "story_insights", "creator_marketplace_projects",
      "creator_marketplace_invited_creator_onboarding", "delta", "story_reactions",
      "onboarding_welcome_message_series", "follow", "comment_poll_response",
      "story_poll_response", "share_to_story",
    ]);
    const notOffered = WEBHOOK_FIELDS.filter((f) => !OFFERED.has(f));
    check(
      "every field we request is one Instagram Login offers",
      notOffered.length === 0,
      notOffered.join(", "),
    );

    // When the core set fails too the caller must hear about it, not get a
    // silent half-success: that is the unverified-callback-URL case.
    const dead = new InstagramClient("token", "igid");
    (dead as unknown as { subscribeWebhooks: () => Promise<unknown> }).subscribeWebhooks =
      async () => {
        throw new Error("(#2200) callback verification failed");
      };
    let threw = "";
    await dead.subscribeWebhooksWithFallback().catch((e: Error) => (threw = e.message));
    check("a total failure propagates", threw.includes("callback verification failed"));
  }

  section("Delay steps reach the queue");
  {
    // A Delay step's resume used to be refused by BullMQ on every enqueue, and
    // the run waited for the 10-minute sweep instead. Nothing failed visibly,
    // because the sweep is a working fallback — so this goes through BullMQ's
    // own validation, not a copy of its rules.
    const queue = getQueue("flow");
    const at = new Date(Date.now() + 60 * 60 * 1000);
    const id = resumeJobId("cmxe2eresume00001", "delay_ab12", at);

    let queued = false;
    try {
      const job = await queue.add("resume", { kind: "resume", flowRunId: "e2e", nodeId: "x" }, { delay: 3_600_000, jobId: id });
      queued = job.id === id;
      await job.remove();
    } catch (error) {
      console.log(`    (BullMQ said: ${(error as Error).message})`);
    }
    check("BullMQ accepts the resume job ID", queued);

    let oldRejected = false;
    try {
      const legacy = `resume:cmxe2eresume00001:delay_ab12:${at.getTime()}`;
      const job = await queue.add("resume", {}, { delay: 3_600_000, jobId: legacy });
      await job.remove();
    } catch {
      oldRejected = true;
    }
    check("the old colon-separated ID is still rejected, so this test would have caught it", oldRejected);

    check(
      "the ID is deterministic, so a double enqueue collapses into one job",
      resumeJobId("r", "n", at) === resumeJobId("r", "n", at),
    );
  }
  await runBillingChecks(prisma, check, section);
  await runEmailChecks(prisma, check, section);
  await runRefundChecks(prisma, check, section);
  await runBrandingChecks(prisma, check, section);
  await runContentChecks(check, section);
  await runSheetsChecks(prisma, check, section);
  await runParityChecks(prisma, check, section);

  section("Tenant boundary in the customer UI");
  {
    // Under the Tech Provider model there is one Meta app and we own it. Its
    // setup values — above all the webhook verify token — are ours, and the
    // customer dashboard used to render them to every signed-in browser. This
    // is a source scan rather than a runtime assertion because the failure mode
    // is someone pasting the panel back in, not a code path misbehaving.
    const CUSTOMER_TREES = [
      "src/app/(app)",
      "src/app/(marketing)",
      "src/app/(auth)",
      "src/components/dashboard",
      "src/components/marketing",
      // What customers read in their inbox is customer-facing too.
      "src/lib/email/templates.ts",
    ];
    const FORBIDDEN = [
      "webhookVerifyToken",
      "missingInstagramConfig",
      "META_APP_SECRET",
      "META_WEBHOOK_VERIFY_TOKEN",
      "ANTHROPIC_API_KEY",
      "DODO_PAYMENTS",
      "BILLING_ENABLED",
      "webhookSecret",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "EMAIL_PROVIDER",
      "SES_REGION",
      "AWS_",
    ];

    function walk(dir: string): string[] {
      if (!statSync(dir).isDirectory()) return [dir];
      let out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out = out.concat(walk(full));
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
      }
      return out;
    }

    const offenders: string[] = [];
    for (const tree of CUSTOMER_TREES) {
      for (const file of walk(tree)) {
        const source = readFileSync(file, "utf8");
        for (const needle of FORBIDDEN) {
          if (source.includes(needle)) offenders.push(`${file} → ${needle}`);
        }
      }
    }

    check(
      "the customer-facing tree names no platform secret or env var",
      offenders.length === 0,
      offenders.join("; "),
    );
  }

  // --- Result ---------------------------------------------------------------

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The Redis client used by the rate limiter keeps the event loop alive.
    const { getRedis } = await import("../src/lib/redis");
    await getRedis().quit().catch(() => undefined);
  });
