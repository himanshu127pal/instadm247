import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAiConfigured } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/bits";
import { AiAgentView } from "@/components/dashboard/ai-view";

export default async function AiPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  // One agent per workspace is plenty for Phase 1; the schema allows more.
  let agent = await prisma.aiAgent.findFirst({ where: { workspaceId: workspace.id } });
  if (!agent) {
    agent = await prisma.aiAgent.create({ data: { workspaceId: workspace.id } });
  }

  const docs = await prisma.knowledgeDoc.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="AI agent"
        description="Answers DMs from your own knowledge base — and hands the conversation to you the moment it isn't sure."
      />
      <AiAgentView
        agent={{
          id: agent.id,
          name: agent.name,
          enabled: agent.enabled,
          persona: agent.persona,
          tone: agent.tone,
          language: agent.language,
          maxTurns: agent.maxTurns,
          bannedTopics: agent.bannedTopics,
          fallbackMessage: agent.fallbackMessage,
          handoffOnUnknown: agent.handoffOnUnknown,
          model: agent.model,
        }}
        docs={docs.map((doc) => ({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          createdAt: doc.createdAt.toISOString(),
        }))}
        modelConfigured={isAiConfigured()}
      />
    </div>
  );
}
