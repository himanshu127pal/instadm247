import type { Contact, FlowRun, InstagramAccount } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { NormalizedEvent, OutboundMessage } from "@/lib/meta/types";
import { getClientForAccount } from "@/lib/meta/account";
import { dispatch } from "./dispatch";
import { recordEvent } from "./analytics";
import { enqueue } from "./queues";
import {
  flowGraphSchema,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type MessagePayload,
} from "./schema";
import { generateAiReply } from "@/lib/ai/agent";
import { issueCoupon } from "./coupons";
import { renderTemplate } from "./template";
import { emitWebhook } from "./outbound-webhooks";
import { SKIP_EXPLANATIONS, SkipReason } from "./guards";
import { featureForNode, hasFeature } from "@/lib/plan";
import { FEATURE_LABELS } from "@/lib/billing/plans";

/**
 * The flow engine: walks the node graph for a single contact.
 *
 * Executors never touch the Instagram API directly — every outbound message
 * goes through `dispatch()` so the safety guards always apply.
 */

export type RunContext = {
  run: FlowRun;
  account: InstagramAccount;
  /** The workspace's resolved plan, read once per tick. See docs/BILLING.md. */
  planKey: string;
  contact: Contact;
  conversationId: string;
  graph: FlowGraph;
  variables: Record<string, unknown>;
  event: NormalizedEvent | null;
};

export type NodeResult =
  | { kind: "continue"; handle?: string }
  | { kind: "goto"; nodeId: string }
  | { kind: "wait"; resumeAt: Date; nodeId: string }
  | { kind: "halt"; reason: string };

const MAX_STEPS_PER_TICK = 40; // cycle guard

// --- Entry points -----------------------------------------------------------

export async function startFlowRun(params: {
  automationId: string;
  accountId: string;
  contactId: string;
  conversationId?: string;
  event: NormalizedEvent;
  keyword?: string;
}): Promise<FlowRun | null> {
  const automation = await prisma.automation.findUnique({
    where: { id: params.automationId },
    include: { flow: true },
  });
  if (!automation?.flow) return null;

  const parsed = flowGraphSchema.safeParse({
    nodes: automation.flow.nodes,
    edges: automation.flow.edges,
  });
  if (!parsed.success) {
    console.error("[engine] flow graph is invalid", automation.id, parsed.error.message);
    return null;
  }

  const trigger = parsed.data.nodes.find((n) => n.type === "TRIGGER");
  if (!trigger) return null;

  const conversationId =
    params.conversationId ?? (await ensureConversation(params.accountId, params.contactId));

  const run = await prisma.flowRun.create({
    data: {
      accountId: params.accountId,
      automationId: params.automationId,
      contactId: params.contactId,
      conversationId,
      triggerType: params.event.kind,
      triggerPayload: {
        mediaId: params.event.mediaId ?? null,
        commentId: params.event.commentId ?? null,
        adId: params.event.adId ?? null,
        keyword: params.keyword ?? null,
        text: params.event.text ?? null,
        timestamp: params.event.timestamp.toISOString(),
        isLive: params.event.kind === "LIVE_COMMENT",
      },
      variables: {
        keyword: params.keyword ?? "",
        trigger_text: params.event.text ?? "",
      },
      currentNodeId: trigger.id,
    },
  });

  await recordEvent({
    accountId: params.accountId,
    automationId: params.automationId,
    contactId: params.contactId,
    type: "trigger_fired",
    meta: { kind: params.event.kind, keyword: params.keyword },
  });

  return advance(run.id, trigger.id);
}

/** Resume a run that was waiting on a delay, a follow re-check, or an answer. */
export async function resumeFlowRun(flowRunId: string, nodeId: string): Promise<FlowRun | null> {
  return advance(flowRunId, nodeId);
}

// --- The walker -------------------------------------------------------------

async function advance(flowRunId: string, fromNodeId: string): Promise<FlowRun | null> {
  const run = await prisma.flowRun.findUnique({
    where: { id: flowRunId },
    include: { automation: { include: { flow: true } }, account: true, contact: true },
  });
  if (!run || !run.automation.flow) return null;
  if (run.status === "completed" || run.status === "halted" || run.status === "failed") return run;

  const parsed = flowGraphSchema.safeParse({
    nodes: run.automation.flow.nodes,
    edges: run.automation.flow.edges,
  });
  if (!parsed.success) return run;

  const workspace = await prisma.workspace.findUnique({
    where: { id: run.account.workspaceId },
    select: { planKey: true },
  });

  const ctx: RunContext = {
    run,
    account: run.account,
    planKey: workspace?.planKey ?? "free",
    contact: run.contact,
    conversationId: run.conversationId ?? (await ensureConversation(run.accountId, run.contactId)),
    graph: parsed.data,
    variables: (run.variables as Record<string, unknown>) ?? {},
    event: null,
  };

  let currentId: string | null = fromNodeId;
  let steps = 0;

  while (currentId && steps < MAX_STEPS_PER_TICK) {
    steps++;
    const node = ctx.graph.nodes.find((n) => n.id === currentId);
    if (!node) break;

    const step = await prisma.flowRunStep.create({
      data: { flowRunId: run.id, nodeId: node.id, nodeType: node.type, status: "entered" },
    });
    await recordEvent({
      accountId: run.accountId,
      automationId: run.automationId,
      contactId: run.contactId,
      type: "node_entered",
      nodeId: node.id,
    });

    let result: NodeResult;
    // The plan gate at run time. This is what makes a downgrade safe: flows
    // built on a higher plan are kept exactly as they are, and simply stop at
    // the first node the current plan doesn't cover — with a reason the
    // customer can read. Upgrading again resumes them with nothing to rebuild.
    const feature = featureForNode(node.type);
    const allowed = !feature || hasFeature({ planKey: ctx.planKey }, feature);
    try {
      result = allowed
        ? await executeNode(ctx, node)
        : {
            kind: "halt",
            reason: `${SKIP_EXPLANATIONS[SkipReason.PLAN_FEATURE]} (${FEATURE_LABELS[feature!]})`,
          };
    } catch (error) {
      const message = (error as Error).message ?? "Unknown error";
      await prisma.flowRunStep.update({
        where: { id: step.id },
        data: { status: "failed", error: message, endedAt: new Date() },
      });
      await prisma.flowRun.update({
        where: { id: run.id },
        data: { status: "failed", error: message, completedAt: new Date() },
      });
      console.error("[engine] node failed", node.type, node.id, message);
      return prisma.flowRun.findUnique({ where: { id: run.id } });
    }

    await prisma.flowRunStep.update({
      where: { id: step.id },
      data: {
        status: result.kind === "wait" ? "waiting" : result.kind === "halt" ? "skipped" : "completed",
        detail: { result: result.kind, ...("handle" in result ? { handle: result.handle } : {}) },
        endedAt: new Date(),
      },
    });

    // Persist any variables the node collected.
    await prisma.flowRun.update({
      where: { id: run.id },
      data: { variables: ctx.variables as object, currentNodeId: node.id },
    });

    if (result.kind === "halt") {
      await prisma.flowRun.update({
        where: { id: run.id },
        data: { status: "halted", haltReason: result.reason, completedAt: new Date() },
      });
      return prisma.flowRun.findUnique({ where: { id: run.id } });
    }

    if (result.kind === "wait") {
      await prisma.flowRun.update({
        where: { id: run.id },
        data: { status: "waiting", resumeAt: result.resumeAt, currentNodeId: result.nodeId },
      });
      const delay = Math.max(0, result.resumeAt.getTime() - Date.now());
      const queued = await enqueue(
        "flow",
        "resume",
        { kind: "resume", flowRunId: run.id, nodeId: result.nodeId },
        { delay, jobId: resumeJobId(run.id, result.nodeId, result.resumeAt) },
      );
      if (!queued) {
        // No Redis: the sweep_windows maintenance job picks waiting runs up.
        console.warn("[engine] could not queue resume; will be swept", run.id);
      }
      return prisma.flowRun.findUnique({ where: { id: run.id } });
    }

    currentId =
      result.kind === "goto" ? result.nodeId : nextNodeId(ctx.graph.edges, node.id, result.handle);
  }

  await prisma.flowRun.update({
    where: { id: run.id },
    data: { status: "completed", completedAt: new Date(), currentNodeId: null },
  });
  await recordEvent({
    accountId: run.accountId,
    automationId: run.automationId,
    contactId: run.contactId,
    type: "flow_completed",
  });
  void emitWebhook(run.account.workspaceId, "flow.completed", {
    flow_run_id: run.id,
    automation_id: run.automationId,
    contact_id: run.contactId,
    variables: ctx.variables,
  }).catch(() => undefined);

  return prisma.flowRun.findUnique({ where: { id: run.id } });
}

/**
 * The BullMQ job ID for resuming a run at a node. Deterministic, so a resume
 * that gets queued twice collapses into one job.
 *
 * No colons. BullMQ rejects a custom ID containing ":" unless it has exactly
 * three parts — a carve-out for legacy repeatable jobs — and this one had four.
 * Every Delay step's resume was refused, and the run sat until the 10-minute
 * sweep found it: a "wait 30 minutes" step took up to 40. Nothing failed
 * visibly, because the sweep is a working fallback. It must stay a fallback.
 *
 * Unambiguous with "-": a cuid has none, and the timestamp is digits.
 */
export function resumeJobId(runId: string, nodeId: string, at: Date): string {
  return `resume-${runId}-${nodeId}-${at.getTime()}`;
}

function nextNodeId(edges: FlowEdge[], nodeId: string, handle = "next"): string | null {
  const edge =
    edges.find((e) => e.source === nodeId && (e.sourceHandle ?? "next") === handle) ??
    // Fall back to any outgoing edge so a half-wired branch still moves on
    // rather than silently dead-ending.
    (handle === "next" ? edges.find((e) => e.source === nodeId) : undefined);
  return edge?.target ?? null;
}

// --- Node executors ---------------------------------------------------------

async function executeNode(ctx: RunContext, node: FlowNode): Promise<NodeResult> {
  switch (node.type) {
    case "TRIGGER":
      return { kind: "continue" };

    case "SEND_MESSAGE": {
      const payload = (ctx.run.triggerPayload ?? {}) as Record<string, unknown>;
      const commentId = payload.commentId as string | undefined;
      const isLive = payload.isLive === true;
      const commentAt = payload.timestamp ? new Date(String(payload.timestamp)) : undefined;

      // A private reply is how we legitimately open a thread from a comment.
      const usePrivateReply = node.data.asPrivateReply && Boolean(commentId);

      const result = await dispatch({
        accountId: ctx.account.id,
        contactId: ctx.contact.id,
        conversationId: ctx.conversationId,
        target: usePrivateReply
          ? { to: "comment", commentId: commentId! }
          : { to: "user", igsid: ctx.contact.igsid },
        message: toOutbound(node.data.message, ctx),
        source: "automation",
        flowRunId: ctx.run.id,
        nodeId: node.id,
        commentAt,
        isLiveComment: isLive,
      });

      if (result.status === "skipped") return { kind: "halt", reason: result.explanation };
      if (result.status === "failed" && !result.retryable) {
        return { kind: "halt", reason: result.error };
      }
      return { kind: "continue" };
    }

    case "REPLY_TO_COMMENT": {
      const payload = (ctx.run.triggerPayload ?? {}) as Record<string, unknown>;
      const commentId = payload.commentId as string | undefined;
      if (!commentId) return { kind: "continue" };

      const text = renderTemplate(
        node.data.replies[Math.floor(Math.random() * node.data.replies.length)],
        ctx,
      );
      const client = await getClientForAccount(ctx.account);
      if (client) {
        try {
          await client.replyToComment(commentId, text);
        } catch (error) {
          // A public reply failing must never kill the DM flow.
          console.warn("[engine] public comment reply failed", (error as Error).message);
        }
      }
      return { kind: "continue" };
    }

    case "DELAY":
      return {
        kind: "wait",
        resumeAt: new Date(Date.now() + node.data.minutes * 60 * 1000),
        nodeId: nextNodeId(ctx.graph.edges, node.id) ?? node.id,
      };

    case "CONDITION": {
      const results = await Promise.all(
        node.data.conditions.map((c) => evaluateCondition(ctx, c)),
      );
      const passed = node.data.mode === "any" ? results.some(Boolean) : results.every(Boolean);
      return { kind: "continue", handle: passed ? "yes" : "no" };
    }

    case "FOLLOWER_CHECK": {
      const isFollower = await resolveFollowerStatus(ctx);
      return { kind: "continue", handle: isFollower ? "yes" : "no" };
    }

    case "ASK_FOR_FOLLOW": {
      // Already following? Skip the ask entirely.
      if (await resolveFollowerStatus(ctx)) return { kind: "continue", handle: "yes" };

      const result = await dispatch({
        accountId: ctx.account.id,
        contactId: ctx.contact.id,
        conversationId: ctx.conversationId,
        target: { to: "user", igsid: ctx.contact.igsid },
        message: toOutbound(node.data.message, ctx),
        source: "automation",
        flowRunId: ctx.run.id,
        nodeId: node.id,
      });
      if (result.status === "skipped") return { kind: "halt", reason: result.explanation };

      // Come back to this same node later to re-check whether they followed.
      ctx.variables[`__asked_follow_${node.id}`] = true;
      const alreadyAsked = ctx.variables[`__follow_recheck_${node.id}`] === true;
      if (alreadyAsked) return { kind: "continue", handle: "no" };
      ctx.variables[`__follow_recheck_${node.id}`] = true;

      return {
        kind: "wait",
        resumeAt: new Date(Date.now() + node.data.recheckAfterMinutes * 60 * 1000),
        nodeId: node.id,
      };
    }

    case "COLLECT_INPUT": {
      const answered = ctx.variables[node.data.variable];
      if (answered !== undefined && answered !== null && answered !== "") {
        return { kind: "continue", handle: "next" };
      }

      // Already asked and still nothing? Take the timeout branch.
      if (ctx.variables[`__asked_${node.id}`] === true) {
        return { kind: "continue", handle: "timeout" };
      }

      const message: MessagePayload = node.data.options?.length
        ? {
            kind: "buttons",
            text: node.data.prompt,
            buttons: node.data.options.slice(0, 3).map((option) => ({
              type: "postback" as const,
              title: option.slice(0, 20),
              payload: `ANSWER:${ctx.run.id}:${node.id}:${option}`,
            })),
          }
        : { kind: "text", text: node.data.prompt };

      const result = await dispatch({
        accountId: ctx.account.id,
        contactId: ctx.contact.id,
        conversationId: ctx.conversationId,
        target: { to: "user", igsid: ctx.contact.igsid },
        message: toOutbound(message, ctx),
        source: "automation",
        flowRunId: ctx.run.id,
        nodeId: node.id,
      });
      if (result.status === "skipped") return { kind: "halt", reason: result.explanation };

      ctx.variables[`__asked_${node.id}`] = true;
      // Park here; the ingest worker fills the variable when they reply and
      // resumes this exact node. The timer is the give-up path.
      await prisma.flowRun.update({
        where: { id: ctx.run.id },
        data: { variables: ctx.variables as object },
      });

      return {
        kind: "wait",
        resumeAt: new Date(Date.now() + node.data.timeoutMinutes * 60 * 1000),
        nodeId: node.id,
      };
    }

    case "AI_REPLY": {
      const reply = await generateAiReply({
        workspaceId: ctx.account.workspaceId,
        agentId: node.data.agentId,
        instructions: node.data.instructions,
        contact: ctx.contact,
        conversationId: ctx.conversationId,
      });

      if (!reply.answered && node.data.handoffOnUnknown) {
        await prisma.conversation.update({
          where: { id: ctx.conversationId },
          data: { humanTakeover: true, takeoverAt: new Date(), status: "open", unreadCount: { increment: 1 } },
        });
      }

      const result = await dispatch({
        accountId: ctx.account.id,
        contactId: ctx.contact.id,
        conversationId: ctx.conversationId,
        target: { to: "user", igsid: ctx.contact.igsid },
        message: { kind: "text", text: reply.text },
        source: "ai",
        flowRunId: ctx.run.id,
        nodeId: node.id,
      });
      if (result.status === "skipped") return { kind: "halt", reason: result.explanation };

      return reply.answered ? { kind: "continue" } : { kind: "halt", reason: "Handed to a human." };
    }

    case "SEND_COUPON": {
      const issued = await issueCoupon(node.data.poolId, ctx.contact.id);

      if (!issued.ok) {
        // Running out of codes must not look like success. Tell them something
        // honest and take the "empty" branch so the flow can recover.
        if (node.data.emptyMessage) {
          await dispatch({
            accountId: ctx.account.id,
            contactId: ctx.contact.id,
            conversationId: ctx.conversationId,
            target: { to: "user", igsid: ctx.contact.igsid },
            message: { kind: "text", text: node.data.emptyMessage },
            source: "automation",
            flowRunId: ctx.run.id,
            nodeId: node.id,
          });
        }
        console.warn("[engine] coupon pool unavailable", node.data.poolId, issued.reason);
        return { kind: "continue", handle: "empty" };
      }

      // Expose it as {{coupon}} for this and every later step.
      ctx.variables.coupon = issued.code;

      const result = await dispatch({
        accountId: ctx.account.id,
        contactId: ctx.contact.id,
        conversationId: ctx.conversationId,
        target: { to: "user", igsid: ctx.contact.igsid },
        message: toOutbound(node.data.message, ctx),
        source: "automation",
        flowRunId: ctx.run.id,
        nodeId: node.id,
      });
      if (result.status === "skipped") return { kind: "halt", reason: result.explanation };

      return { kind: "continue", handle: "next" };
    }

    case "TAG": {
      const current = new Set(ctx.contact.tags);
      for (const tag of node.data.tags) {
        if (node.data.action === "add") current.add(tag);
        else current.delete(tag);
      }
      const tags = [...current];
      await prisma.contact.update({ where: { id: ctx.contact.id }, data: { tags } });
      ctx.contact = { ...ctx.contact, tags };
      return { kind: "continue" };
    }

    case "SET_FIELD": {
      const fields = { ...((ctx.contact.customFields as Record<string, unknown>) ?? {}) };
      fields[node.data.key] = renderTemplate(node.data.value, ctx);
      await prisma.contact.update({
        where: { id: ctx.contact.id },
        data: { customFields: fields as object },
      });
      ctx.contact = { ...ctx.contact, customFields: fields as never };
      return { kind: "continue" };
    }

    case "RANDOMIZER": {
      const total = node.data.branches.reduce((sum, b) => sum + b.weight, 0);
      if (total <= 0) return { kind: "continue", handle: node.data.branches[0].key };
      let roll = Math.random() * total;
      for (const branch of node.data.branches) {
        roll -= branch.weight;
        if (roll <= 0) return { kind: "continue", handle: branch.key };
      }
      return { kind: "continue", handle: node.data.branches.at(-1)!.key };
    }

    case "HTTP_REQUEST": {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(renderTemplate(node.data.url, ctx), {
          method: node.data.method,
          headers: { "Content-Type": "application/json", ...node.data.headers },
          body:
            node.data.method === "GET"
              ? undefined
              : renderTemplate(node.data.body ?? JSON.stringify(ctx.variables), ctx),
          signal: controller.signal,
        });
        if (node.data.saveAs) {
          const text = await res.text();
          try {
            ctx.variables[node.data.saveAs] = JSON.parse(text);
          } catch {
            ctx.variables[node.data.saveAs] = text;
          }
        }
      } catch (error) {
        // An outbound integration being down shouldn't strand the contact.
        console.warn("[engine] http_request failed", (error as Error).message);
        if (node.data.saveAs) ctx.variables[node.data.saveAs] = null;
      } finally {
        clearTimeout(timeout);
      }
      return { kind: "continue" };
    }

    case "HUMAN_HANDOFF": {
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: {
          humanTakeover: true,
          takeoverAt: new Date(),
          status: "open",
          unreadCount: { increment: 1 },
        },
      });
      if (node.data.notifyMessage) {
        await dispatch({
          accountId: ctx.account.id,
          contactId: ctx.contact.id,
          conversationId: ctx.conversationId,
          target: { to: "user", igsid: ctx.contact.igsid },
          message: toOutbound(node.data.notifyMessage, ctx),
          source: "automation",
          flowRunId: ctx.run.id,
          nodeId: node.id,
        });
      }
      return { kind: "halt", reason: node.data.note ?? "Handed to a human." };
    }

    case "END": {
      if (node.data.goal) {
        await recordEvent({
          accountId: ctx.account.id,
          automationId: ctx.run.automationId,
          contactId: ctx.contact.id,
          type: "goal_reached",
          nodeId: node.id,
        });
      }
      return { kind: "halt", reason: node.data.goal ? "Goal reached" : "Flow finished" };
    }
  }
}

// --- Condition evaluation ---------------------------------------------------

async function evaluateCondition(
  ctx: RunContext,
  condition: { field: string; operator: string; key?: string; value?: string },
): Promise<boolean> {
  let actual: unknown;

  switch (condition.field) {
    case "is_follower":
      actual = await resolveFollowerStatus(ctx);
      break;
    case "has_tag":
      actual = ctx.contact.tags.includes(condition.value ?? condition.key ?? "");
      break;
    case "custom_field":
      actual = ((ctx.contact.customFields as Record<string, unknown>) ?? {})[condition.key ?? ""];
      break;
    case "variable":
      actual = ctx.variables[condition.key ?? ""];
      break;
    case "message_text":
      actual = (ctx.run.triggerPayload as Record<string, unknown>)?.text ?? "";
      break;
    case "hour_of_day":
      actual = new Date().getHours();
      break;
    case "is_first_time": {
      const count = await prisma.flowRun.count({
        where: { automationId: ctx.run.automationId, contactId: ctx.contact.id },
      });
      actual = count <= 1;
      break;
    }
    default:
      actual = undefined;
  }

  const expected = condition.value;

  switch (condition.operator) {
    case "is_true":
      return actual === true || actual === "true";
    case "is_false":
      return actual === false || actual === "false" || actual == null;
    case "equals":
      return String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
    case "not_equals":
      return String(actual ?? "").toLowerCase() !== String(expected ?? "").toLowerCase();
    case "contains":
      return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "not_contains":
      return !String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "greater_than":
      return Number(actual) > Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "not_exists":
      return actual === undefined || actual === null || actual === "";
    default:
      return false;
  }
}

/**
 * Follower status, cached for an hour. `is_user_follow_business` comes from the
 * User Profile API and is what the Follower Growth Tool branches on.
 */
async function resolveFollowerStatus(ctx: RunContext): Promise<boolean> {
  const fresh =
    ctx.contact.followerCheckedAt &&
    Date.now() - ctx.contact.followerCheckedAt.getTime() < 60 * 60 * 1000;
  if (fresh && ctx.contact.isFollower !== null) return ctx.contact.isFollower;

  const client = await getClientForAccount(ctx.account);
  if (!client) return ctx.contact.isFollower ?? false;

  try {
    const profile = await client.getUserProfile(ctx.contact.igsid);
    const isFollower = profile.is_user_follow_business ?? false;

    if (isFollower && ctx.contact.isFollower === false) {
      await recordEvent({
        accountId: ctx.account.id,
        automationId: ctx.run.automationId,
        contactId: ctx.contact.id,
        type: "follow_gained",
      });
    }

    await prisma.contact.update({
      where: { id: ctx.contact.id },
      data: {
        isFollower,
        followerCheckedAt: new Date(),
        username: profile.username ?? ctx.contact.username,
        name: profile.name ?? ctx.contact.name,
        profilePicUrl: profile.profile_pic ?? ctx.contact.profilePicUrl,
      },
    });
    ctx.contact = { ...ctx.contact, isFollower, followerCheckedAt: new Date() };
    return isFollower;
  } catch {
    return ctx.contact.isFollower ?? false;
  }
}

// --- helpers ----------------------------------------------------------------

/** Interpolate personalisation variables into every text field of a payload. */
function toOutbound(payload: MessagePayload, ctx: RunContext): OutboundMessage {
  switch (payload.kind) {
    case "text":
      return { kind: "text", text: renderTemplate(payload.text, ctx) };
    case "buttons":
      return {
        kind: "buttons",
        text: renderTemplate(payload.text, ctx),
        buttons: payload.buttons.map((b) =>
          b.type === "web_url"
            ? { type: "web_url", title: b.title, url: renderTemplate(b.url, ctx) }
            : { type: "postback", title: b.title, payload: b.payload },
        ),
      };
    case "carousel":
      return {
        kind: "carousel",
        slides: payload.slides.map((s) => ({
          title: renderTemplate(s.title, ctx),
          subtitle: s.subtitle ? renderTemplate(s.subtitle, ctx) : undefined,
          image_url: s.image_url,
          buttons: s.buttons?.map((b) =>
            b.type === "web_url"
              ? { type: "web_url" as const, title: b.title, url: renderTemplate(b.url, ctx) }
              : { type: "postback" as const, title: b.title, payload: b.payload },
          ),
        })),
      };
    default:
      return payload;
  }
}

async function ensureConversation(accountId: string, contactId: string): Promise<string> {
  const existing = await prisma.conversation.findUnique({
    where: { accountId_contactId: { accountId, contactId } },
  });
  if (existing) return existing.id;
  const created = await prisma.conversation.create({ data: { accountId, contactId } });
  return created.id;
}
