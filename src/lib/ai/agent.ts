import type { Contact } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env, isAiConfigured } from "@/lib/env";
import { normalizeText } from "@/lib/engine/match";

/**
 * The AI agent node.
 *
 * Deliberately conservative: it answers from a retrieved knowledge base, and if
 * it can't ground an answer it says so and hands off rather than inventing
 * something a customer will act on. Without ANTHROPIC_API_KEY it degrades to
 * the configured fallback message — it never blocks a flow.
 */

export type AiReply = { text: string; answered: boolean; usedDocs: string[] };

export async function generateAiReply(params: {
  workspaceId: string;
  agentId?: string;
  instructions?: string;
  contact: Contact;
  conversationId: string;
}): Promise<AiReply> {
  const agent = params.agentId
    ? await prisma.aiAgent.findUnique({ where: { id: params.agentId } })
    : await prisma.aiAgent.findFirst({ where: { workspaceId: params.workspaceId, enabled: true } });

  const fallback = agent?.fallbackMessage ?? "Let me get a human to help with that — one moment!";

  // Recent turns give the model the thread; also the max-turns guardrail.
  const history = await prisma.message.findMany({
    where: { conversationId: params.conversationId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { direction: true, text: true, source: true },
  });
  const ordered = history.reverse().filter((m) => m.text);

  const aiTurns = ordered.filter((m) => m.source === "ai").length;
  if (agent && aiTurns >= agent.maxTurns) {
    return { text: fallback, answered: false, usedDocs: [] };
  }

  const question = ordered.findLast((m) => m.direction === "inbound")?.text ?? "";

  // Guardrail: refuse configured banned topics outright.
  if (agent?.bannedTopics.length) {
    const haystack = normalizeText(question);
    if (agent.bannedTopics.some((topic) => haystack.includes(normalizeText(topic)))) {
      return { text: fallback, answered: false, usedDocs: [] };
    }
  }

  const docs = await retrieveDocs(params.workspaceId, agent?.id, question);

  if (!isAiConfigured()) {
    // No model configured. Try to be useful from the knowledge base alone
    // rather than silently doing nothing.
    if (docs.length > 0) {
      return {
        text: docs[0].content.slice(0, 900),
        answered: true,
        usedDocs: docs.map((d) => d.id),
      };
    }
    return { text: fallback, answered: false, usedDocs: [] };
  }

  try {
    const text = await callAnthropic({
      model: agent?.model ?? "claude-sonnet-5",
      system: buildSystemPrompt(agent, params.instructions, docs, params.contact),
      messages: ordered.map((m) => ({
        role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
        content: m.text ?? "",
      })),
    });

    // The model is instructed to emit this exact token when it can't ground an
    // answer — that's our handoff signal.
    if (!text || text.includes("[[HANDOFF]]")) {
      return { text: fallback, answered: false, usedDocs: docs.map((d) => d.id) };
    }
    return { text: text.slice(0, 950), answered: true, usedDocs: docs.map((d) => d.id) };
  } catch (error) {
    console.error("[ai] generation failed", (error as Error).message);
    return { text: fallback, answered: false, usedDocs: [] };
  }
}

function buildSystemPrompt(
  agent: { persona: string; tone: string; language: string } | null,
  instructions: string | undefined,
  docs: Array<{ title: string; content: string }>,
  contact: Contact,
): string {
  const parts = [
    agent?.persona ?? "You are a helpful assistant for an Instagram creator.",
    `Tone: ${agent?.tone ?? "friendly"}.`,
    agent?.language && agent.language !== "auto"
      ? `Always reply in ${agent.language}.`
      : "Reply in the same language the person wrote in.",
    "You are replying inside an Instagram DM. Keep it under 900 characters, warm and direct. No markdown, no bullet lists.",
    "Only state facts that appear in the knowledge base below. If the answer isn't there, reply with exactly [[HANDOFF]] and nothing else.",
    "Never invent prices, availability, shipping times, or policies.",
    instructions ? `Extra instructions: ${instructions}` : "",
    contact.name ? `You are talking to ${contact.name}.` : "",
    docs.length
      ? `Knowledge base:\n${docs.map((d) => `## ${d.title}\n${d.content}`).join("\n\n")}`
      : "Knowledge base: (empty)",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Keyword-overlap retrieval. FAQ-scale knowledge bases don't need embeddings,
 * and this keeps the deployment to just Postgres + Redis.
 */
async function retrieveDocs(workspaceId: string, agentId: string | undefined, question: string) {
  const docs = await prisma.knowledgeDoc.findMany({
    where: { workspaceId, ...(agentId ? { OR: [{ agentId }, { agentId: null }] } : {}) },
    select: { id: true, title: true, content: true, keywords: true },
    take: 100,
  });
  if (docs.length === 0) return [];

  const terms = new Set(normalizeText(question).split(" ").filter((t) => t.length > 2));
  if (terms.size === 0) return docs.slice(0, 3);

  const scored = docs.map((doc) => {
    const haystack = normalizeText(`${doc.title} ${doc.content} ${doc.keywords.join(" ")}`);
    let score = 0;
    for (const term of terms) if (haystack.includes(term)) score++;
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.doc);
}

async function callAnthropic(params: {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  // Anthropic requires the first message to be from the user.
  const messages = params.messages.filter((m) => m.content.trim().length > 0);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (messages.length === 0) return "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 400,
      system: params.system,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
}
