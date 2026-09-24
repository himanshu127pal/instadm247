import { z } from "zod";
import { requireFeature } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { assertAutomation, ok, parseBody, route } from "@/lib/api";
import { findRewindCandidates, runRewind } from "@/lib/engine/rewind";
import { enqueue } from "@/lib/engine/queues";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Preview: who would this rewind actually reach, and why is everyone else out? */
export const PUT = route(async ({ workspace, request }) => {
  const { automationId } = await parseBody(
    request,
    z.object({ automationId: z.string().min(1) }),
  );
  await assertAutomation(workspace.id, automationId);

  const { preview } = await findRewindCandidates(automationId);
  return ok({ preview });
});

/** Start a rewind. */
export const POST = route(async ({ workspace, request }) => {
  requireFeature(workspace, "rewind");
  const { automationId } = await parseBody(
    request,
    z.object({ automationId: z.string().min(1) }),
  );
  const automation = await assertAutomation(workspace.id, automationId);

  // One at a time per automation — two concurrent rewinds would race for the
  // same comments and waste the per-comment reply allowance.
  const running = await prisma.rewindJob.findFirst({
    where: { automationId, status: { in: ["pending", "running"] } },
  });
  if (running) {
    return Response.json(
      { error: "A rewind is already running for this automation." },
      { status: 409 },
    );
  }

  const job = await prisma.rewindJob.create({
    data: { accountId: automation.accountId, automationId, status: "pending" },
  });

  const queued = await enqueue("broadcast", "rewind", { rewindJobId: job.id });
  if (!queued) {
    void runRewind(job.id).catch((error) =>
      console.error("[rewind] inline run failed", error),
    );
  }

  return ok({ job });
});

/** Poll a rewind's progress. */
export const GET = route(async ({ workspace, request }) => {
  const automationId = new URL(request.url).searchParams.get("automationId");
  if (!automationId) return ok({ jobs: [] });

  await assertAutomation(workspace.id, automationId);
  const jobs = await prisma.rewindJob.findMany({
    where: { automationId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return ok({ jobs });
});
