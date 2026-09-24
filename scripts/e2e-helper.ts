/**
 * The AI Helper, run from e2e-check.ts. See docs/HELPER.md.
 *
 * The model is stubbed at fetch with Anthropic's streaming format, so what's
 * asserted is the real loop: the request we'd send, the tools it runs, and the
 * events the page would receive.
 */

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { hasFeature, helperBudget } from "../src/lib/plan";
import { PLANS, helperBudgetMicros } from "../src/lib/billing/plans";
import { getHelperSpend, getUsage, nextWeekStart, periodKey, reserveHelperSpend, reserveUsage, weekKey } from "../src/lib/billing/usage";
import { GUIDE } from "../src/lib/helper/guide";
import { buildDraftGraph, checkDraft, customizeSchema, type Draft } from "../src/lib/helper/draft";
import { runHelperTool } from "../src/lib/helper/tools";
import { HELPER_SYSTEM, runHelper, type HelperEvent } from "../src/lib/helper/run";
import { HELPER_TOOLS } from "../src/lib/helper/tools";
import { actualMicros, modelPrice, worstCaseMicros } from "../src/lib/helper/pricing";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

type Mutable = { billing: { enabled: boolean }; anthropicApiKey: string; helperModel: string };
const mutableEnv = env as unknown as Mutable;

/** Does a dashboard path have a page? `/dashboard/x/y` → src/app/(app)/dashboard/x/y/page.tsx. */
function pageExists(path: string): boolean {
  return existsSync(`src/app/(app)${path.replace(/\?.*$/, "")}/page.tsx`);
}

export async function runHelperChecks(prisma: PrismaClient, check: Check, section: Section) {
  // --- The guide ------------------------------------------------------------

  section("AI Helper: the guide");

  const paths = GUIDE.flatMap((s) => [
    ...(s.path ? [s.path] : []),
    ...[...s.body.matchAll(/\((\/dashboard[^)\s]*)\)/g)].map((m) => m[1]),
  ]);
  const missing = paths.filter((p) => !pageExists(p));
  check("every page the guide sends people to exists", paths.length > 10 && missing.length === 0, missing.join(", "));
  check(
    "the guide covers every page in the sidebar",
    ["automations", "inbox", "broadcasts", "planner", "scheduler", "contacts", "forms", "bio", "analytics", "ai", "accounts", "safety", "templates", "developers", "billing"].every(
      (p) => GUIDE.some((s) => s.path === `/dashboard/${p}` || s.path?.startsWith(`/dashboard/${p}/`)),
    ),
  );
  check(
    "the prompt is the same for every customer, so one cache serves them all",
    !HELPER_SYSTEM.includes(new Date().toISOString().slice(0, 10)),
  );

  // --- Plans ----------------------------------------------------------------

  section("AI Helper: who gets it");

  check("the default model is Sonnet 5, and it has a price", env.helperModel === "claude-sonnet-5" && modelPrice(env.helperModel) !== null);

  const saved = { billing: mutableEnv.billing.enabled, key: mutableEnv.anthropicApiKey, model: mutableEnv.helperModel };
  try {
    mutableEnv.billing.enabled = true;
    check("every plan includes it, Free too", ["free", "pro", "business"].every((k) => hasFeature({ planKey: k }, "aiHelper")));
    check(
      "5 questions a week on Free, 20 on Pro, 50 on Business",
      PLANS.free.limits.helperQuestionsPerWeek === 5 &&
        PLANS.pro.limits.helperQuestionsPerWeek === 20 &&
        PLANS.business.limits.helperQuestionsPerWeek === 50,
    );
    check(
      "Free, and anything nobody pays for, can cost at most $1 a month",
      helperBudgetMicros(PLANS.free) === 1_000_000 && helperBudgetMicros(PLANS.unlimited) === 1_000_000,
    );
    check(
      "a paid plan can cost at most 10% of the cheapest way to pay for it",
      (["pro", "business"] as const).every((k) => {
        const p = PLANS[k].price!;
        return helperBudgetMicros(PLANS[k]) <= 0.1 * Math.min(p.month, p.year / 12) * 1_000_000;
      }),
    );
    mutableEnv.billing.enabled = false;
    check("with billing off, everyone has it", hasFeature({ planKey: "free" }, "aiHelper"));
    check("but capped at $1 a month, since nobody's paying yet", helperBudget({ planKey: "business" }) === 1_000_000);
  } finally {
    mutableEnv.billing.enabled = saved.billing;
  }

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e helper ${tag}`, slug: `e2e-helper-${tag}`, planKey: "pro" },
  });
  const other = await prisma.workspace.create({
    data: { name: `e2e helper other ${tag}`, slug: `e2e-helper-other-${tag}`, planKey: "free" },
  });

  try {
    mutableEnv.billing.enabled = true;
    // A Wednesday, so the week runs Monday 22nd to Sunday 28th.
    const at = new Date("2026-09-23T12:00:00Z");
    check("weeks are ISO weeks in UTC", weekKey(at) === "2026-W39" && weekKey(new Date("2027-01-01T00:00:00Z")) === "2026-W53");
    check("a week resets on Monday 00:00 UTC", nextWeekStart(at).toISOString() === "2026-09-28T00:00:00.000Z");
    check("Sunday night is still the same week", weekKey(new Date("2026-09-27T23:59:59Z")) === "2026-W39");

    const emailsBefore = await prisma.emailMessage.count();
    await prisma.usageCounter.create({
      data: { workspaceId: workspace.id, period: weekKey(at), metric: "helper", count: PLANS.pro.limits.helperQuestionsPerWeek - 1 },
    });
    check("the last question of the week is allowed", await reserveUsage(workspace, "helper", at));
    check("the one after it isn't", !(await reserveUsage(workspace, "helper", at)));
    check("next Monday, they can ask again", await reserveUsage(workspace, "helper", new Date("2026-09-28T00:00:01Z")));
    check("running low on questions sends no email", (await prisma.emailMessage.count()) === emailsBefore);
    check("the week's count shows on the billing page", (await getUsage(workspace.id, at)).helper === PLANS.pro.limits.helperQuestionsPerWeek);
    check("and doesn't touch the month's DM count", (await getUsage(workspace.id, at)).dms === 0);

    const racing = await Promise.all(Array.from({ length: 5 }, () => reserveHelperSpend(other.id, 300_000, 1_000_000, at)));
    check("questions racing each other can't take the month past its cap", racing.filter(Boolean).length === 3);
    check("a single call dearer than the whole cap is refused", !(await reserveHelperSpend(other.id, 1_000_001, 1_000_000, at)));

    const free = { id: other.id, planKey: "free" };
    const asked = [];
    for (let i = 0; i < 6; i++) asked.push(await reserveUsage(free, "helper", at));
    check("Free gets exactly 5 a week", asked.filter(Boolean).length === 5 && asked[5] === false);
  } finally {
    mutableEnv.billing.enabled = saved.billing;
  }

  // --- Drafts -----------------------------------------------------------------

  section("AI Helper: draft automations");

  const account = await prisma.instagramAccount.create({
    data: { workspaceId: workspace.id, igUserId: `e2e_helper_${tag}`, username: `helper_${tag}`, status: "connected" },
  });
  const otherAccount = await prisma.instagramAccount.create({
    data: { workspaceId: other.id, igUserId: `e2e_helper_o_${tag}`, username: `other_${tag}`, status: "connected" },
  });

  const draft = (over: Partial<Draft> = {}): Draft => ({
    accountId: account.id,
    name: "Ebook",
    triggerType: "COMMENT",
    matchMode: "KEYWORD",
    keywords: ["BOOK"],
    scope: "ALL_MEDIA",
    presetId: "comment-to-dm",
    customize: {},
    ...over,
  });

  const graph = buildDraftGraph("comment-to-dm", {
    starterMessage: "Here's the ebook, {{first_name}} 📘",
    link: { url: "https://shop.example.org/ebook", title: "Get the ebook" },
    publicReplies: ["Sent! 📩"],
  });
  const json = JSON.stringify(graph);
  check(
    "the customer's words replace the template's",
    json.includes("Here's the ebook") && json.includes("https://shop.example.org/ebook") && json.includes("Sent! 📩"),
  );
  check("and no placeholder link is left behind", !json.includes("https://example.com"));
  check("a draft link must be https", !customizeSchema.safeParse({ link: { url: "http://x.org", title: "x" } }).success);

  mutableEnv.billing.enabled = true;
  try {
    check("a sensible draft has no problems", checkDraft({ planKey: "pro" }, draft()).length === 0, checkDraft({ planKey: "pro" }, draft()).join("; "));
    check("keyword matching without keywords is refused", checkDraft({ planKey: "pro" }, draft({ keywords: [] })).length > 0);
    check(
      "a public comment reply on a DM trigger is refused",
      checkDraft({ planKey: "pro" }, draft({ triggerType: "DM_KEYWORD" })).some((p) => /public reply/.test(p)),
    );
    check(
      "a template the plan can't run is refused, with the plan that can",
      checkDraft({ planKey: "free" }, draft({ presetId: "ai-faq", triggerType: "DM_KEYWORD", matchMode: "ALL", keywords: [] })).some(
        (p) => /Pro/.test(p),
      ),
    );
  } finally {
    mutableEnv.billing.enabled = saved.billing;
  }

  // --- Tools ------------------------------------------------------------------

  section("AI Helper: what it can see");

  const otherAutomation = await prisma.automation.create({
    data: { accountId: otherAccount.id, name: "Not yours", triggerType: "COMMENT", keywords: ["X"], flow: { create: {} } },
  });
  const mine = await prisma.automation.create({
    data: { accountId: account.id, name: "Mine", triggerType: "COMMENT", keywords: ["LINK"], flow: { create: {} } },
  });
  const contact = await prisma.contact.create({
    data: { accountId: account.id, igsid: `e2e_helper_c_${tag}`, username: `private_follower_${tag}` },
  });
  const conversation = await prisma.conversation.create({ data: { accountId: account.id, contactId: contact.id } });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      contactId: contact.id,
      direction: "outbound",
      kind: "text",
      text: `secret message ${tag}`,
      source: "automation",
      status: "skipped",
      skipReason: "WINDOW_EXPIRED",
    },
  });

  const ws = { id: workspace.id, planKey: "pro" };
  const list = await runHelperTool(ws, "list_automations", {});
  check("it lists this workspace's automations", list.content.includes("Mine"));
  check("and never another workspace's", !list.content.includes("Not yours"));
  const foreign = await runHelperTool(ws, "get_automation", { automation_id: otherAutomation.id });
  check("it can't open another workspace's automation by id", Boolean(foreign.isError));
  const detail = await runHelperTool(ws, "get_automation", { automation_id: mine.id });
  check("it can open its own", !detail.isError && detail.content.includes("LINK"));
  const skipped = await runHelperTool(ws, "get_skipped_messages", {});
  check("it sees why messages were skipped", skipped.content.includes("WINDOW_EXPIRED"));
  const everything = [list, detail, skipped, await runHelperTool(ws, "get_workspace_overview", {})].map((o) => o.content).join(" ");
  check(
    "no tool shows it a follower's username or message",
    !everything.includes("private_follower") && !everything.includes("secret message"),
  );

  const wrongAccount = await runHelperTool(ws, "draft_automation", {
    account_username: `other_${tag}`,
    name: "x",
    trigger: "COMMENT",
    match_mode: "KEYWORD",
    keywords: ["BOOK"],
    template: "comment-to-dm",
  });
  check("it can't draft on another workspace's account", Boolean(wrongAccount.isError));
  const proposed = await runHelperTool(ws, "draft_automation", {
    name: "Ebook",
    trigger: "COMMENT",
    match_mode: "KEYWORD",
    keywords: ["BOOK"],
    template: "comment-to-dm",
    link_url: "https://shop.example.org/ebook",
    link_title: "Get it",
  });
  check(
    "a draft comes back as a card, not an automation",
    Boolean(proposed.proposal) && (await prisma.automation.count({ where: { accountId: account.id } })) === 1,
  );

  // --- The loop, against a stubbed model -------------------------------------

  section("AI Helper: the conversation");

  const requests: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  type Reply = string | (() => Response);
  const replies: Reply[] = [
    sse([{ type: "tool_use", id: "toolu_1", name: "list_automations", input: {} }], "tool_use"),
    sse([{ type: "text", text: "You have one automation, **Mine**." }], "end_turn"),
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL | string | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.startsWith("https://api.anthropic.com/")) {
      requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      const reply = replies.shift() ?? sse([{ type: "text", text: "?" }], "end_turn");
      if (typeof reply === "function") return reply();
      return new Response(reply, {
        status: 200,
        headers: { "content-type": "text/event-stream", "request-id": "req_e2e" },
      });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  mutableEnv.anthropicApiKey = "e2e-key";
  mutableEnv.helperModel = "claude-sonnet-5";

  try {
    const events: HelperEvent[] = [];
    for await (const event of runHelper({ workspace: ws, history: [], question: "What automations do I have?", page: "/dashboard/automations" })) {
      events.push(event);
    }
    const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
    check("it looks things up, then answers", requests.length === 2 && text.includes("**Mine**"), JSON.stringify(events));
    check("it says what it's doing while it looks", events.some((e) => e.type === "status"));
    check("and finishes cleanly", events.at(-1)?.type === "done");

    const first = requests[0]?.body ?? {};
    const system = first.system as Array<{ text: string; cache_control?: unknown }>;
    check("the shared prompt is cached", Boolean(system?.[0]?.cache_control) && system[0].text === HELPER_SYSTEM);
    check("the page they came from goes after the cache, not in it", Boolean(system?.[1]?.text.includes("/dashboard/automations")));
    check(
      "no fallback model is used, so every call runs on the model it was priced for",
      first.fallbacks === undefined && !(requests[0]?.headers.get("anthropic-beta") ?? "").includes("fallback"),
    );
    const second = requests[1]?.body.messages as Array<{ role: string; content: unknown }>;
    const toolResult = JSON.stringify(second?.at(-1)?.content ?? "");
    check("the lookup's result goes back to the model", toolResult.includes("tool_result") && toolResult.includes("Mine"));

    // --- Money ----------------------------------------------------------------

    section("AI Helper: it never costs more than the plan allows");

    const price = modelPrice("claude-sonnet-5")!;
    const cap = helperBudget(ws);
    const spend = () => getHelperSpend(ws.id);
    const setSpend = (micros: number) =>
      prisma.usageCounter.upsert({
        where: { workspaceId_period_metric: { workspaceId: ws.id, period: periodKey(), metric: "helper_spend" } },
        create: { workspaceId: ws.id, period: periodKey(), metric: "helper_spend", count: micros },
        update: { count: micros },
      });
    const ask = async (question = "How do I schedule a post?") => {
      const events: HelperEvent[] = [];
      for await (const e of runHelper({ workspace: ws, history: [], question })) events.push(e);
      return events;
    };

    // The two calls above were settled at what they really cost.
    const usage = { input_tokens: 900, cache_read_input_tokens: 6_000, cache_creation_input_tokens: 0, output_tokens: 400 };
    const expected = 2 * actualMicros(price, usage);
    check("each call is charged what it actually cost, not its worst case", Math.abs((await spend()) - expected) <= 2, `${await spend()} vs ${expected}`);

    await setSpend(cap - 1_000);
    requests.length = 0;
    replies.length = 0;
    const refused = await ask();
    check(
      "when the month's cap can't cover a call's worst case, no call is made",
      requests.length === 0 && refused.some((e) => e.type === "error" && e.code === "budget"),
    );
    check("and nothing is charged for it", (await spend()) === cap - 1_000);

    // Round one fits, round two doesn't: stop between them.
    await setSpend(0);
    const firstRound = worstCaseMicros({
      price,
      prefixText: HELPER_SYSTEM + JSON.stringify(HELPER_TOOLS),
      prefixTokens: 6_000,
      restText: "x".repeat(2_000),
      priorOutputTokens: 0,
      maxTokens: 4_096,
    });
    await setSpend(cap - Math.ceil(firstRound * 1.6));
    requests.length = 0;
    replies.length = 0;
    replies.push(
      sse([{ type: "tool_use", id: "toolu_2", name: "list_automations", input: {} }], "tool_use", {
        ...usage,
        output_tokens: 4_000,
      }),
    );
    const cut = await ask();
    check(
      "when the money runs out mid-answer, it stops there and says so",
      requests.length === 1 && cut.at(-1)?.type === "done" && (cut.at(-1) as { budget?: boolean }).budget === true,
      JSON.stringify(cut.slice(-2)),
    );
    check("and the month never goes over the cap", (await spend()) <= cap);

    // A call that fails part-way may have been billed for anything up to its
    // worst case, so that's what stays charged; one the API refused, nothing.
    await setSpend(0);
    replies.length = 0;
    replies.push(() => {
      throw new TypeError("socket hang up");
    });
    await ask().catch(() => undefined);
    const afterDrop = await spend();
    check("a dropped call keeps its whole worst case charged", afterDrop > 30_000, String(afterDrop));
    await setSpend(0);
    replies.push(() => new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "down" } }), { status: 500 }));
    await ask().catch(() => undefined);
    check("a call the API refused costs nothing", (await spend()) === 0, String(await spend()));
    check("and it isn't retried behind our back", requests.at(-1) !== undefined && replies.length === 0);

    // The worst case really is the worst: bill a call at every limit at once.
    await setSpend(0);
    const huge = "🔥".repeat(2_000);
    replies.push(
      sse([{ type: "text", text: "ok" }], "max_tokens", {
        input_tokens: Buffer.byteLength(JSON.stringify([{ role: "user", content: huge }])) + 1_000,
        cache_creation_input_tokens: 6_000,
        cache_read_input_tokens: 0,
        output_tokens: 4_096,
      }),
    );
    await ask(huge);
    check("even a call billed at every limit stays inside what was reserved", (await spend()) <= cap);

    mutableEnv.helperModel = "claude-some-future-model";
    requests.length = 0;
    const unpriced = await ask();
    check("a model we have no price for is never called", requests.length === 0 && unpriced.some((e) => e.type === "error"));
    mutableEnv.helperModel = "claude-sonnet-5";
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.anthropicApiKey = saved.key;
    mutableEnv.helperModel = saved.model;
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, other.id] } } });
  }
}

/** One streamed Messages API response, in Anthropic's server-sent events format. */
function sse(
  blocks: Array<{ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: object }>,
  stopReason: string,
  usage: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; output_tokens: number } = {
    input_tokens: 900,
    cache_read_input_tokens: 6_000,
    cache_creation_input_tokens: 0,
    output_tokens: 400,
  },
): string {
  const events: Array<[string, object]> = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_e2e",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage.input_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
            output_tokens: 1,
          },
        },
      },
    ],
  ];
  blocks.forEach((block, index) => {
    if (block.type === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }]);
    } else {
      events.push([
        "content_block_start",
        { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } },
      ]);
      events.push([
        "content_block_delta",
        { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } },
      ]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: usage.output_tokens } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}
