/**
 * The follower gate and automation analytics, against Instagram's real
 * request and error shapes. Run from e2e-check.ts. Instagram is stubbed at
 * fetch.
 *
 * The bugs these guard:
 * - follower status was read for commenters, whom Instagram's profile API
 *   won't answer for until they message or tap a button; the refusal was
 *   swallowed as "not following", so nobody from a comment ever passed;
 * - an automation's Triggered and Sent waited up to 15 minutes for a rollup,
 *   and the rollup overwrote its oldest day with a partial count;
 * - link taps in automation DMs were never tracked, so CTR was always 0%;
 *   reads were never tied to an automation;
 * - a re-check timer firing after the person had already answered ran the
 *   step again.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { encrypt } from "../src/lib/crypto";
import { handleEvent, handleSideEffect } from "../src/lib/engine/ingest";
import { resumeDueRun } from "../src/lib/engine/run";
import { PRESETS } from "../src/lib/engine/presets";
import { rollupDailyStats, utcDayStart } from "../src/lib/engine/analytics";
import { isPreviewFetch, readTrackedLink, trackedUrl } from "../src/lib/engine/links";
import { getAutomationPerformance } from "../src/lib/queries";
import { GET as followLink } from "../src/app/go/[token]/route";
import type { NormalizedEvent } from "../src/lib/meta/types";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;
type Mutable = { meta: { appId: string; appSecret: string } };
const mutableEnv = env as unknown as Mutable;

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0";

export async function runFollowAnalyticsChecks(prisma: PrismaClient, check: Check, section: Section) {
  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e follow ${tag}`, slug: `e2e-follow-${tag}`, planKey: "business" },
  });
  const account = await prisma.instagramAccount.create({
    data: {
      workspaceId: workspace.id, igUserId: `e2e_follow_ig_${tag}`, username: `e2e_follow_${tag}`,
      status: "connected", accessTokenEnc: encrypt("e2e-not-a-real-token"),
    },
  });
  const preset = PRESETS.find((p) => p.id === "follower-growth")!;
  const graph = preset.build();
  const askId = graph.nodes.find((n) => n.type === "ASK_FOR_FOLLOW")!.id;
  const automation = await prisma.automation.create({
    data: {
      accountId: account.id, name: `e2e follow gate ${tag}`, triggerType: "COMMENT", scope: "ALL_MEDIA",
      matchMode: "KEYWORD", keywords: ["GUIDE"], enabled: true,
      flow: { create: { name: "e2e follow gate", nodes: graph.nodes as object[], edges: graph.edges as object[] } },
    },
  });

  // --- Instagram, stubbed ------------------------------------------------------
  // Per person: whether they've interacted (so the profile API answers) and
  // whether they follow.
  const people = new Map<string, { consent: boolean; follows: boolean }>();
  const sent: Array<{ to: string; body: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.hostname !== "graph.instagram.com") return realFetch(url, init);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (u.pathname.endsWith("/messages")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sent.push({ to: body.recipient.comment_id ? `comment:${body.recipient.comment_id}` : `user:${body.recipient.id}`, body: JSON.stringify(body.message) });
      return json(200, { recipient_id: "r", message_id: `m_${tag}_${sent.length}` });
    }
    if (u.pathname.endsWith("/replies")) return json(200, { id: `reply_${sent.length}` });
    const igsid = u.pathname.split("/").pop()!;
    const person = people.get(igsid);
    if (person && u.searchParams.get("fields")?.includes("is_user_follow_business")) {
      if (!person.consent) {
        // What Instagram answers for someone who has only commented.
        return json(400, { error: { message: "User consent is required to access user profile", type: "OAuthException", code: 230, fbtrace_id: "e2e" } });
      }
      return json(200, { username: `fan_${igsid}`, name: "Fan", is_user_follow_business: person.follows });
    }
    return json(404, { error: { message: "Unknown path", code: 803 } });
  }) as typeof fetch;
  const saved = { appId: mutableEnv.meta.appId, appSecret: mutableEnv.meta.appSecret };
  mutableEnv.meta.appId = "e2e-app-id";
  mutableEnv.meta.appSecret = "e2e-app-secret";

  let n = 0;
  const comment = (igsid: string): NormalizedEvent => ({
    dedupeKey: `e2e_follow_c_${tag}_${++n}`, igUserId: account.igUserId, kind: "COMMENT", igsid,
    username: `fan_${igsid}`, text: "GUIDE please", timestamp: new Date(), commentId: `e2e_follow_comment_${tag}_${n}`,
    mediaId: `e2e_media_${tag}`, raw: {},
  });
  const tap = (igsid: string, payload: string): NormalizedEvent => ({
    dedupeKey: `e2e_follow_p_${tag}_${++n}`, igUserId: account.igUserId, kind: "POSTBACK", igsid,
    payload, text: "I've followed ✅", timestamp: new Date(), messageId: `e2e_follow_mid_${tag}_${n}`, raw: {},
  });
  const runOf = async (igsid: string) =>
    prisma.flowRun.findFirstOrThrow({ where: { automationId: automation.id, contact: { igsid } }, orderBy: { startedAt: "desc" } });
  const payloadIn = (body: string) => body.match(/FOLLOWED:[^"]+/)?.[0] ?? "";

  try {
    // --- A follower who comes from a comment -----------------------------------
    section("Follower gate: someone who comments, already follows, and taps");
    const fan = `e2e_fan_${tag}`;
    people.set(fan, { consent: false, follows: true });
    await handleEvent(comment(fan));
    check("the ask goes out as the comment's private reply", sent.length === 1 && sent[0].to.startsWith("comment:"), JSON.stringify(sent));
    const ask = sent[0]?.body ?? "";
    check("with an \"I've followed\" button that names this run", ask.includes("I've followed") && payloadIn(ask).startsWith("FOLLOWED:"), ask);
    let run = await runOf(fan);
    check("and the run waits for the tap", run.status === "waiting" && run.currentNodeId === askId, `${run.status} at ${run.currentNodeId}`);
    const before = await prisma.contact.findFirst({ where: { igsid: fan, accountId: account.id } });
    check("Instagram wouldn't say yet, so they're unknown, not 'not following'", before?.isFollower === null, String(before?.isFollower));

    // Tapping is the interaction that lets the profile API answer.
    people.set(fan, { consent: true, follows: true });
    await handleEvent(tap(fan, payloadIn(ask)));
    run = await runOf(fan);
    const after = await prisma.contact.findFirst({ where: { igsid: fan, accountId: account.id } });
    check("on the tap we check, and see they follow", after?.isFollower === true);
    check("so they get the guide straight away", sent.length === 2 && sent[1].to === `user:${fan}` && sent[1].body.includes("Here it is"), sent[1]?.body);
    // An END step marked as a goal finishes the run as "halted: Goal reached".
    check("and the run reaches its goal", run.haltReason === "Goal reached", `${run.status}: ${run.haltReason}`);

    const stale = await resumeDueRun(run.id, askId);
    check("the re-check timer firing later does nothing", stale === null && sent.length === 2);

    // --- Never taps --------------------------------------------------------------
    section("Follower gate: someone who comments and never taps");
    const quiet = `e2e_quiet_${tag}`;
    people.set(quiet, { consent: false, follows: false });
    await handleEvent(comment(quiet));
    let quietRun = await runOf(quiet);
    await prisma.flowRun.update({ where: { id: quietRun.id }, data: { resumeAt: new Date(Date.now() - 1000) } });
    const sentBefore = sent.length;
    await resumeDueRun(quietRun.id, askId);
    quietRun = await runOf(quiet);
    check(
      "when the timer runs out the flow stops, without a DM Instagram would refuse",
      quietRun.status === "halted" && quietRun.haltReason !== "Goal reached" && sent.length === sentBefore,
      `${quietRun.status}: ${quietRun.haltReason}`,
    );

    // --- Taps without following --------------------------------------------------
    section("Follower gate: someone who taps without following");
    const shy = `e2e_shy_${tag}`;
    people.set(shy, { consent: false, follows: false });
    await handleEvent(comment(shy));
    const firstAsk = sent.at(-1)!.body;
    people.set(shy, { consent: true, follows: false });
    await handleEvent(tap(shy, payloadIn(firstAsk)));
    const reminder = sent.at(-1)!;
    check("they're told once that the follow isn't showing, with the button again", reminder.to === `user:${shy}` && reminder.body.includes("can't see your follow") && payloadIn(reminder.body) !== "", reminder.body);
    check("and the run waits for another tap", (await runOf(shy)).status === "waiting");
    await handleEvent(tap(shy, payloadIn(reminder.body)));
    check("a second tap without a follow takes the 'no' path (here: deliver anyway)", sent.at(-1)!.body.includes("Here it is") && (await runOf(shy)).haltReason === "Goal reached");
    const shyContact = await prisma.contact.findFirst({ where: { igsid: shy, accountId: account.id } });
    check("and they're recorded as not following", shyContact?.isFollower === false);

    // --- Clicks ---------------------------------------------------------------------
    section("Analytics: link taps in automation DMs");
    const guide = JSON.parse(sent[1].body) as { attachment: { payload: { buttons: Array<{ url?: string }> } } };
    const link = guide.attachment.payload.buttons[0]?.url ?? "";
    check("the guide's link button goes through our click counter", link.startsWith(`${env.appUrl}/go/`), link);
    const token = link.slice(`${env.appUrl}/go/`.length);
    const open = (t: string, ua = PHONE) =>
      followLink(new Request(`http://localhost/go/${t}`, { headers: { "user-agent": ua } }), { params: Promise.resolve({ token: t }) });
    const first = await open(token);
    check("a tap lands on the real destination", first.status === 302 && first.headers.get("location") === "https://example.com/", first.headers.get("location") ?? "");
    await open(token);
    await open(token, "facebookexternalhit/1.1");
    const clicks = await prisma.analyticsEvent.count({ where: { type: "link_clicked", automationId: automation.id } });
    check("tapping twice is one click, and link previews aren't clicks", clicks === 1, String(clicks));
    const forged = token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    const bad = await open(forged);
    check("an edited link can't redirect anywhere", bad.headers.get("location") === `${env.appUrl}/`, bad.headers.get("location") ?? "");
    check(
      "and can't be pointed at another site",
      readTrackedLink(trackedUrl("https://evil.example", "r", "n").split("/go/")[1].replace(/^[^.]+/, Buffer.from(JSON.stringify({ u: "https://evil.example", r: "x", n: "n" })).toString("base64url"))) === null,
    );
    check("only web links are wrapped", trackedUrl("tel:+15551234", "r", "n") === "tel:+15551234");
    check("a phone's in-app browser counts; a crawler doesn't", !isPreviewFetch(PHONE) && isPreviewFetch("Slackbot-LinkExpanding 1.0") && isPreviewFetch(null));

    // --- Reads ------------------------------------------------------------------------
    await handleSideEffect({ type: "message_seen", igUserId: account.igUserId, igsid: fan, at: new Date() });
    await handleSideEffect({ type: "message_seen", igUserId: account.igUserId, igsid: fan, at: new Date() });
    const reads = await prisma.analyticsEvent.count({ where: { type: "message_seen", automationId: automation.id } });
    check("a read receipt counts each message once, against its automation", reads === 2, String(reads));

    // --- The numbers on the automation card ---------------------------------------------
    section("Analytics: the automation card");
    const triggered = await prisma.analyticsEvent.count({ where: { type: "trigger_fired", automationId: automation.id } });
    const delivered = await prisma.analyticsEvent.count({ where: { type: "message_sent", automationId: automation.id } });
    let card = (await getAutomationPerformance(workspace.id)).find((a) => a.id === automation.id)!;
    check(
      "Triggered and Sent show at once, before any rollup",
      card.metrics.triggered === 3 && triggered === 3 && card.metrics.sent === delivered && delivered === sent.length,
      JSON.stringify(card.metrics),
    );
    check("Clicked and CTR come from the taps", card.metrics.clicked === 1 && Math.abs(card.metrics.ctr - 1 / delivered) < 1e-9, JSON.stringify(card.metrics));
    check("and Opened from the reads", card.metrics.opened === 2);

    await rollupDailyStats();
    await rollupDailyStats();
    card = (await getAutomationPerformance(workspace.id)).find((a) => a.id === automation.id)!;
    check("after the rollup (twice) nothing is counted twice", card.metrics.triggered === 3 && card.metrics.clicked === 1, JSON.stringify(card.metrics));
    const today = await prisma.dailyStat.findFirst({ where: { automationId: automation.id, date: utcDayStart(0) } });
    check("and today's row holds the full day", today?.triggered === 3 && today.sent === delivered && today.clicked === 1, JSON.stringify(today));

    // The old rollup counted the last 48 hours and wrote that over the row, so
    // the oldest day in its window kept only its last few hours.
    const dayBefore = utcDayStart(2);
    for (const hour of [1, 12, 23]) {
      await prisma.analyticsEvent.create({
        data: { accountId: account.id, automationId: automation.id, type: "trigger_fired", createdAt: new Date(dayBefore.getTime() + hour * 3_600_000) },
      });
    }
    await rollupDailyStats();
    const old = await prisma.dailyStat.findFirst({ where: { automationId: automation.id, date: dayBefore } });
    check("a day at the edge of the rollup keeps all its events", old?.triggered === 3, String(old?.triggered));
    card = (await getAutomationPerformance(workspace.id)).find((a) => a.id === automation.id)!;
    check("and the 30-day total includes it", card.metrics.triggered === 6, String(card.metrics.triggered));

    // --- A deliver step that also asks for the private reply ------------------------
    // How customers build it: an Ask for follow, then their usual "Send DM"
    // with "Send as a private reply" still on. The ask used the comment's one
    // private reply, so the deliver step was refused as a second one and the
    // person who tapped never got anything.
    section("Follower gate: a deliver step set to reply privately");
    const custom = PRESETS.find((p) => p.id === "follower-growth")!.build();
    for (const node of custom.nodes) if (node.type === "SEND_MESSAGE") node.data.asPrivateReply = true;
    await prisma.automation.update({ where: { id: automation.id }, data: { enabled: false } });
    const second = await prisma.automation.create({
      data: {
        accountId: account.id, name: `e2e follow custom ${tag}`, triggerType: "COMMENT", scope: "ALL_MEDIA",
        matchMode: "KEYWORD", keywords: ["GUIDE"], enabled: true, reentryPolicy: "ALWAYS",
        flow: { create: { name: "e2e follow custom", nodes: custom.nodes as object[], edges: custom.edges as object[] } },
      },
    });
    const late = `e2e_late_${tag}`;
    people.set(late, { consent: false, follows: false });
    const lateComment = comment(late);
    await handleEvent(lateComment);
    const lateAsk = sent.at(-1)!;
    check("the ask is the private reply", lateAsk.to.startsWith("comment:"));
    people.set(late, { consent: true, follows: false });
    await handleEvent(tap(late, payloadIn(lateAsk.body)));
    const lateReminder = sent.at(-1)!;
    await handleEvent(tap(late, payloadIn(lateReminder.body)));
    const lateDeliver = sent.at(-1)!;
    const lateRun = await prisma.flowRun.findFirstOrThrow({ where: { automationId: second.id, contact: { igsid: late } } });
    check(
      "after they tap, the guide goes as a normal DM instead of a refused second private reply",
      lateDeliver.to === `user:${late}` && lateDeliver.body.includes("Here it is") && lateRun.haltReason === "Goal reached",
      `${lateDeliver.to} ${lateRun.status}: ${lateRun.haltReason}`,
    );
    const skippedPrivate = await prisma.message.count({ where: { flowRunId: lateRun.id, skipReason: "ALREADY_REPLIED" } });
    check("and nothing is skipped as 'already got its private reply'", skippedPrivate === 0, String(skippedPrivate));

    // Meta can deliver the same comment twice. The second run must not turn
    // its refused private reply into a DM.
    const before2 = sent.length;
    await handleEvent({ ...lateComment, dedupeKey: `${lateComment.dedupeKey}_again` });
    const dupRun = await prisma.flowRun.findFirstOrThrow({ where: { automationId: second.id, contact: { igsid: late } }, orderBy: { startedAt: "desc" } });
    check(
      "a duplicate delivery of the comment sends nothing",
      sent.length === before2 && dupRun.id !== lateRun.id && dupRun.status === "halted",
      `${sent.length - before2} sent; ${dupRun.status}: ${dupRun.haltReason}`,
    );
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.meta.appId = saved.appId;
    mutableEnv.meta.appSecret = saved.appSecret;
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
}
