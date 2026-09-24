import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { effectivePlan, helperBudget } from "@/lib/plan";
import { FEATURE_LABELS, type Feature } from "@/lib/billing/plans";
import { getUsage } from "@/lib/billing/usage";
import { getAccountIds, getSkipBreakdown } from "@/lib/queries";
import { SKIP_EXPLANATIONS, type SkipReasonKey } from "@/lib/engine/guards";
import { PRESETS } from "@/lib/engine/presets";
import { flowGraphSchema, validateGraph } from "@/lib/engine/schema";
import { DRAFT_TRIGGERS, checkDraft, describeDraft, draftSchema, type Draft } from "./draft";

/**
 * What the AI Helper can look at. See docs/HELPER.md.
 *
 * Every tool is READ-ONLY and scoped to the asking workspace — the workspace
 * id comes from the session, never from the model. None of them returns a
 * follower's messages, username or anything else about a third party: the
 * helper explains the customer's setup, it doesn't read their DMs. The one
 * tool with an effect, draft_automation, only hands a proposal back to the
 * page; creating it is the customer's click.
 */

export type HelperWorkspace = { id: string; planKey: string };

export type DraftProposal = Draft & {
  accountUsername: string;
  presetName: string;
  steps: string[];
};

export type ToolOutcome = { content: string; isError?: boolean; proposal?: DraftProposal };

const DAY = 86_400_000;

export const HELPER_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_workspace_overview",
    description:
      "The customer's current setup: their plan and what it includes, this month's usage, connected Instagram accounts and their health, and counts of automations, forms, link-in-bio pages, AI agent and integrations. Call this before giving advice that depends on their plan or setup.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_automations",
    description:
      "The customer's automations: id, name, account, trigger, keywords, whether it's live, and how many times it ran in the last 7 days.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_automation",
    description:
      "One automation in detail: its trigger settings, the steps in its flow, any errors that stop it going live, and its last 7 days of runs and skipped messages. Use it to troubleshoot an automation that isn't working.",
    input_schema: {
      type: "object",
      properties: { automation_id: { type: "string", description: "An id from list_automations." } },
      required: ["automation_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_skipped_messages",
    description:
      "Why messages weren't sent in the last 7 days, across the workspace: each skip reason with its count and meaning, plus recent errors Instagram returned. Use it when the customer asks why someone didn't get a DM.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "draft_automation",
    description: `Propose a ready-made automation the customer can create with one click. Nothing is created by calling this: the customer sees a card and chooses whether to create it, and it's created switched off. Use it when they want to set something up, after you know which account and what it should do. If the result lists problems, fix them and call again.
Templates: ${PRESETS.map((p) => `${p.id} (${p.name}: ${p.description})`).join(" | ")}`,
    input_schema: {
      type: "object",
      properties: {
        account_username: {
          type: "string",
          description: "The Instagram @username to run it on, without @. Optional when they have one account.",
        },
        name: { type: "string", description: "A short name for the automation, only the customer sees it." },
        trigger: { type: "string", enum: [...DRAFT_TRIGGERS] },
        match_mode: {
          type: "string",
          enum: ["ALL", "KEYWORD", "REACTION", "REPLY"],
          description: "KEYWORD needs keywords. REACTION/REPLY only for STORY_REPLY.",
        },
        keywords: { type: "array", items: { type: "string" }, description: "For KEYWORD matching, e.g. [\"LINK\"]." },
        scope: {
          type: "string",
          enum: ["ALL_MEDIA", "UNIVERSAL", "AD"],
          description: "Comment triggers only: all posts, everything including future posts and ads, or only ads. Use ALL_MEDIA otherwise.",
        },
        template: { type: "string", enum: PRESETS.map((p) => p.id) },
        starter_message: {
          type: "string",
          description: "The first DM, in the customer's voice. Tokens like {{first_name}} work. Under 900 characters.",
        },
        link_url: { type: "string", description: "An https:// link for the template's button, if the customer gave one." },
        link_title: { type: "string", description: "The button's text, 20 characters max." },
        public_replies: {
          type: "array",
          items: { type: "string" },
          description: "Comment templates only: 1–5 public replies, one picked at random.",
        },
      },
      required: ["name", "trigger", "match_mode", "template"],
      additionalProperties: false,
    },
  },
];

/** The status line the chat shows while a tool runs. */
export const TOOL_STATUS: Record<string, string> = {
  get_workspace_overview: "Looking at your account…",
  list_automations: "Checking your automations…",
  get_automation: "Looking into that automation…",
  get_skipped_messages: "Checking the Safety Center…",
  draft_automation: "Drafting the automation…",
};

export async function runHelperTool(workspace: HelperWorkspace, name: string, input: unknown): Promise<ToolOutcome> {
  switch (name) {
    case "get_workspace_overview":
      return json(await workspaceOverview(workspace));
    case "list_automations":
      return json(await listAutomations(workspace.id));
    case "get_automation": {
      const parsed = z.object({ automation_id: z.string().min(1) }).safeParse(input);
      if (!parsed.success) return error("automation_id is required.");
      return getAutomation(workspace.id, parsed.data.automation_id);
    }
    case "get_skipped_messages":
      return json(await skippedMessages(workspace.id));
    case "draft_automation":
      return draftAutomation(workspace, input);
    default:
      return error(`There's no tool called ${name}.`);
  }
}

const json = (value: unknown): ToolOutcome => ({ content: JSON.stringify(value) });
const error = (message: string): ToolOutcome => ({ content: message, isError: true });

async function workspaceOverview(workspace: HelperWorkspace) {
  const plan = effectivePlan(workspace);
  const [usage, accounts, automations, live, forms, bioPages, agent, docs, integrations, keys] = await Promise.all([
    getUsage(workspace.id),
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      select: {
        username: true,
        status: true,
        accountType: true,
        automationPaused: true,
        slowDownUntil: true,
        webhookSubbed: true,
        lastSyncAt: true,
        viralProtection: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.automation.count({ where: { account: { workspaceId: workspace.id } } }),
    prisma.automation.count({ where: { account: { workspaceId: workspace.id }, enabled: true } }),
    prisma.leadForm.count({ where: { workspaceId: workspace.id } }),
    prisma.bioPage.findMany({ where: { workspaceId: workspace.id }, select: { slug: true, published: true } }),
    prisma.aiAgent.findFirst({ where: { workspaceId: workspace.id }, select: { enabled: true } }),
    prisma.knowledgeDoc.count({ where: { workspaceId: workspace.id } }),
    prisma.integration.findMany({ where: { workspaceId: workspace.id, enabled: true }, select: { provider: true } }),
    prisma.apiKey.count({ where: { workspaceId: workspace.id, revokedAt: null } }),
  ]);
  const all = Object.keys(FEATURE_LABELS) as Feature[];
  const now = Date.now();
  const limit = (n: number) => (Number.isFinite(n) ? n : "unlimited");

  return {
    plan: env.billing.enabled ? plan.name : "All features (paid plans aren't on sale yet)",
    included: all.filter((f) => plan.features.has(f)).map((f) => FEATURE_LABELS[f]),
    notIncluded: all.filter((f) => !plan.features.has(f)).map((f) => FEATURE_LABELS[f]),
    thisMonth: {
      automatedDms: { used: usage.dms, limit: limit(plan.limits.dmsPerMonth) },
      aiReplies: { used: usage.ai_replies, limit: limit(plan.limits.aiRepliesPerMonth) },
      resetsOn: "the 1st of next month (UTC)",
      helperQuestionsThisWeek: {
        used: usage.helper,
        limit: limit(plan.limits.helperQuestionsPerWeek),
        resetsOn: "Monday 00:00 UTC",
      },
      helperMonthlyAllowanceUsedPercent: Math.min(100, Math.round((usage.helperSpend / helperBudget(workspace)) * 100)),
    },
    instagramAccounts: {
      limit: limit(plan.limits.instagramAccounts),
      connected: accounts.map((a) => ({
        username: a.username,
        type: a.accountType,
        status:
          a.status === "connected"
            ? "connected"
            : a.status === "token_expired" || a.status === "revoked"
              ? "needs reconnecting — automations paused"
              : a.status,
        automationsPausedByHand: a.automationPaused,
        slowDownActive: Boolean(a.slowDownUntil && a.slowDownUntil.getTime() > now),
        triggersSubscribed: a.webhookSubbed,
        viralProtection: a.viralProtection,
        postsLastSynced: a.lastSyncAt?.toISOString() ?? "never",
      })),
    },
    automations: { total: automations, live },
    leadForms: forms,
    linkInBioPages: bioPages.map((p) => ({ slug: p.slug, published: p.published })),
    aiAgent: { enabled: Boolean(agent?.enabled), knowledgeArticles: docs },
    integrations: integrations.map((i) => providerName(i.provider)),
    apiKeys: keys,
  };
}

function providerName(provider: string): string {
  if (provider === "kit") return "Kit";
  if (provider === "flodesk") return "Flodesk";
  if (provider.includes("google")) return "Google Sheets";
  return provider;
}

async function listAutomations(workspaceId: string) {
  const since = new Date(Date.now() - 7 * DAY);
  const automations = await prisma.automation.findMany({
    where: { account: { workspaceId } },
    select: {
      id: true,
      name: true,
      triggerType: true,
      matchMode: true,
      keywords: true,
      enabled: true,
      account: { select: { username: true } },
      _count: { select: { runs: { where: { startedAt: { gte: since } } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return automations.map((a) => ({
    id: a.id,
    name: a.name,
    account: a.account.username,
    trigger: a.triggerType,
    matchMode: a.matchMode,
    keywords: a.keywords,
    live: a.enabled,
    runsLast7Days: a._count.runs,
  }));
}

async function getAutomation(workspaceId: string, automationId: string): Promise<ToolOutcome> {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, account: { workspaceId } },
    include: {
      flow: true,
      account: { select: { username: true, status: true, automationPaused: true, webhookSubbed: true } },
      _count: { select: { media: true } },
    },
  });
  if (!automation) return error("No automation with that id in this workspace. Call list_automations for ids.");

  const since = new Date(Date.now() - 7 * DAY);
  const [runs, lastRun, halts, skips] = await Promise.all([
    prisma.flowRun.groupBy({
      by: ["status"],
      where: { automationId, startedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.flowRun.findFirst({ where: { automationId }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.flowRun.groupBy({
      by: ["haltReason"],
      where: { automationId, startedAt: { gte: since }, haltReason: { not: null } },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["skipReason"],
      where: { flowRun: { automationId }, status: "skipped", createdAt: { gte: since }, skipReason: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const parsed = flowGraphSchema.safeParse({ nodes: automation.flow?.nodes ?? [], edges: automation.flow?.edges ?? [] });
  const steps = parsed.success
    ? parsed.data.nodes.filter((n) => n.type !== "TRIGGER").map((n) => `${n.type}: ${n.data.label}`)
    : ["(the saved flow couldn't be read — it needs rebuilding in the builder)"];
  const problems = parsed.success ? validateGraph(parsed.data).map((i) => `${i.level}: ${i.message}`) : [];

  return json({
    id: automation.id,
    name: automation.name,
    live: automation.enabled,
    account: {
      username: automation.account.username,
      connected: automation.account.status === "connected",
      automationsPausedByHand: automation.account.automationPaused,
      triggersSubscribed: automation.account.webhookSubbed,
    },
    trigger: automation.triggerType,
    whichContent: automation.scope,
    specificPostsChosen: automation._count.media,
    matchMode: automation.matchMode,
    howToMatch: automation.matchType,
    keywords: automation.keywords,
    neverRespondTo: automation.negativeKeywords,
    forgiveTypos: automation.fuzzyMatch,
    howOftenPerPerson: automation.reentryPolicy,
    cooldownMinutes: automation.cooldownMinutes,
    flowSteps: steps,
    flowProblems: problems,
    last7Days: {
      runsByStatus: Object.fromEntries(runs.map((r) => [r.status, r._count._all])),
      stoppedBecause: Object.fromEntries(halts.map((h) => [h.haltReason, h._count._all])),
      skippedMessages: skips.map((s) => ({
        reason: s.skipReason,
        count: s._count._all,
        meaning: SKIP_EXPLANATIONS[s.skipReason as SkipReasonKey] ?? s.skipReason,
      })),
    },
    lastTriggered: lastRun?.startedAt.toISOString() ?? "never",
  });
}

async function skippedMessages(workspaceId: string) {
  const accountIds = await getAccountIds(workspaceId);
  const [skips, failures] = await Promise.all([
    getSkipBreakdown(workspaceId, 7),
    prisma.message.groupBy({
      by: ["failReason"],
      where: { contact: { accountId: { in: accountIds } }, status: "failed", createdAt: { gte: new Date(Date.now() - 7 * DAY) } },
      _count: { _all: true },
    }),
  ]);
  return {
    skippedLast7Days: skips.map((s) => ({
      reason: s.reason,
      count: s.count,
      meaning: SKIP_EXPLANATIONS[s.reason as SkipReasonKey] ?? s.reason,
    })),
    failedLast7Days: failures.map((f) => ({ instagramSaid: f.failReason ?? "unknown error", count: f._count._all })),
  };
}

const draftInput = z.object({
  account_username: z.string().optional(),
  name: z.string(),
  trigger: z.string(),
  match_mode: z.string(),
  keywords: z.array(z.string()).optional(),
  scope: z.string().optional(),
  template: z.string(),
  starter_message: z.string().optional(),
  link_url: z.string().optional(),
  link_title: z.string().optional(),
  public_replies: z.array(z.string()).optional(),
});

async function draftAutomation(workspace: HelperWorkspace, input: unknown): Promise<ToolOutcome> {
  const raw = draftInput.safeParse(input);
  if (!raw.success) return error(`The draft is missing something: ${raw.error.issues[0]?.path.join(".")}.`);
  const i = raw.data;

  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, username: true },
  });
  if (accounts.length === 0) {
    return error("They haven't connected an Instagram account yet. Tell them to connect one first (Instagram accounts page).");
  }
  const wanted = i.account_username?.replace(/^@/, "").toLowerCase();
  const account = wanted ? accounts.find((a) => a.username.toLowerCase() === wanted) : accounts.length === 1 ? accounts[0] : null;
  if (!account) {
    return error(`Say which account to use. Connected: ${accounts.map((a) => `@${a.username}`).join(", ")}.`);
  }

  const parsed = draftSchema.safeParse({
    accountId: account.id,
    name: i.name,
    triggerType: i.trigger,
    matchMode: i.match_mode,
    keywords: i.match_mode === "KEYWORD" ? (i.keywords ?? []) : [],
    scope: i.scope ?? "ALL_MEDIA",
    presetId: i.template,
    customize: {
      starterMessage: i.starter_message,
      link: i.link_url ? { url: i.link_url, title: i.link_title || "Open the link" } : undefined,
      publicReplies: i.public_replies?.length ? i.public_replies : undefined,
    },
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return error(`That draft isn't valid: ${issue?.path.join(".")} — ${issue?.message}.`);
  }

  const problems = checkDraft(workspace, parsed.data);
  if (problems.length) return error(`Can't offer this draft yet:\n- ${problems.join("\n- ")}`);

  const proposal: DraftProposal = {
    ...parsed.data,
    accountUsername: account.username,
    presetName: PRESETS.find((p) => p.id === parsed.data.presetId)!.name,
    steps: describeDraft(parsed.data),
  };
  return {
    content:
      "The draft card is now showing below your message. The customer creates it with one click; it's created switched off so they can review the flow in the builder, then turn it on. Tell them what to check or change before going live (for example, the link on the button).",
    proposal,
  };
}
