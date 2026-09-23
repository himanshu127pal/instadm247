import { Worker, type Job } from "bullmq";
import { getRedis, redisAvailable } from "@/lib/redis";
import { assertProductionSecrets } from "@/lib/env";
import { prisma } from "@/lib/db";
import {
  QUEUE_NAMES,
  scheduleMaintenance,
  type BroadcastJob,
  type DispatchJob,
  type EmailJob,
  type FlowJob,
  type IngestJob,
  type MaintenanceJob,
} from "@/lib/engine/queues";
import {
  WEBHOOK_RETENTION_DAYS,
  processWebhookEvent,
  purgeOldWebhookEvents,
} from "@/lib/engine/ingest";
import { resumeFlowRun } from "@/lib/engine/run";
import { dispatch } from "@/lib/engine/dispatch";
import { rollupDailyStats } from "@/lib/engine/analytics";
import { runBroadcast, runDueReengagements } from "@/lib/engine/broadcast";
import { runRewind } from "@/lib/engine/rewind";
import { scanPlannedAutomations } from "@/lib/engine/planner";
import { publishDuePosts } from "@/lib/engine/scheduler";
import { refreshExpiringTokens } from "@/lib/meta/account";
import { reconcilePlans } from "@/lib/billing/resolve";
import { purgeRejectedPaymentEvents } from "@/lib/billing/trace";
import { deliverEmail } from "@/lib/email/send";
import { sendBillingReminders } from "@/lib/email/notify";
import type { OutboundMessage } from "@/lib/meta/types";

/**
 * Worker process. Run alongside the Next.js server:  pnpm worker
 *
 * Everything time-based lives here — delayed flow steps, broadcasts, token
 * refresh, analytics rollups and the DM Planner scanner.
 */

assertProductionSecrets();

const connection = getRedis();

function log(scope: string, message: string, extra?: unknown) {
  const stamp = new Date().toISOString();
  if (extra !== undefined) console.log(`[${stamp}] [${scope}] ${message}`, extra);
  else console.log(`[${stamp}] [${scope}] ${message}`);
}

const workers: Worker[] = [];

workers.push(
  new Worker<IngestJob>(
    QUEUE_NAMES.ingest,
    async (job) => {
      await processWebhookEvent(job.data.webhookEventId);
    },
    { connection, concurrency: 10 },
  ),
);

workers.push(
  new Worker<FlowJob>(
    QUEUE_NAMES.flow,
    async (job) => {
      if (job.data.kind === "resume") {
        await resumeFlowRun(job.data.flowRunId, job.data.nodeId);
      }
    },
    { connection, concurrency: 10 },
  ),
);

workers.push(
  new Worker<DispatchJob>(
    QUEUE_NAMES.dispatch,
    async (job) => {
      const result = await dispatch({
        accountId: job.data.accountId,
        contactId: job.data.contactId,
        conversationId: job.data.conversationId,
        target: job.data.target,
        message: job.data.message as OutboundMessage,
        source: job.data.source,
        humanAgent: job.data.humanAgent,
        flowRunId: job.data.flowRunId,
        nodeId: job.data.nodeId,
        broadcastId: job.data.broadcastId,
      });
      // Throwing lets BullMQ apply its backoff for genuinely retryable failures.
      if (result.status === "failed" && result.retryable) throw new Error(result.error);
    },
    // Deliberately low: the token bucket is the real limiter, this just keeps
    // us from opening dozens of sockets to Instagram at once.
    { connection, concurrency: 4 },
  ),
);

workers.push(
  new Worker<BroadcastJob | { rewindJobId: string }>(
    QUEUE_NAMES.broadcast,
    async (job) => {
      // Rewinds share this queue: both are long fan-outs that must not run
      // many-at-once against the same account.
      if ("rewindJobId" in job.data) await runRewind(job.data.rewindJobId);
      else await runBroadcast(job.data.broadcastId);
    },
    { connection, concurrency: 2 },
  ),
);

workers.push(
  new Worker<MaintenanceJob>(
    QUEUE_NAMES.maintenance,
    async (job) => {
      switch (job.data.kind) {
        case "refresh_tokens": {
          const result = await refreshExpiringTokens();
          log("maintenance", `token refresh: ${result.refreshed} ok, ${result.failed} failed`);
          return;
        }
        case "rollup_stats": {
          const count = await rollupDailyStats();
          log("maintenance", `rolled up ${count} stat groups`);
          return;
        }
        case "scan_planner": {
          const result = await scanPlannedAutomations();
          if (result.matched) log("maintenance", `planner matched ${result.matched} posts`);
          return;
        }
        case "sweep_windows": {
          await sweepStalledRuns();
          return;
        }
        case "reengage": {
          const started = await runDueReengagements();
          if (started) log("maintenance", `started ${started} re-engagement campaigns`);
          return;
        }
        case "publish_due": {
          const published = await publishDuePosts();
          if (published) log("maintenance", `published ${published} scheduled posts`);
          return;
        }
        case "purge_webhooks": {
          const purged = await purgeOldWebhookEvents();
          if (purged) {
            log("maintenance", `purged ${purged} webhook payloads past ${WEBHOOK_RETENTION_DAYS}d`);
          }
          // Rejected payment hits are unauthenticated input and go with them.
          // Verified ones are the financial record and are kept.
          const rejected = await purgeRejectedPaymentEvents();
          if (rejected) log("maintenance", `purged ${rejected} rejected payment hits`);
          return;
        }
        case "billing_reminders": {
          const sent = await sendBillingReminders();
          if (sent) log("maintenance", `queued ${sent} billing reminders`);
          return;
        }
        case "reconcile_plans": {
          const changed = await reconcilePlans();
          if (changed) log("maintenance", `reconciled ${changed} workspace plans`);
          return;
        }
      }
    },
    { connection, concurrency: 2 },
  ),
);

workers.push(
  new Worker<EmailJob>(
    QUEUE_NAMES.email,
    async (job) => {
      // The queue retries with backoff; on the last attempt a failure is
      // recorded as final instead of being thrown for another try.
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await deliverEmail(job.data.emailMessageId, { finalAttempt });
    },
    // SES allows 14/s once out of the sandbox; this stays well under it.
    { connection, concurrency: 5 },
  ),
);

/**
 * Safety net: pick up runs whose resume job was lost (Redis restart, a crash
 * mid-enqueue) and finish them, and close out runs whose window has expired.
 */
async function sweepStalledRuns(): Promise<void> {
  const due = await prisma.flowRun.findMany({
    where: { status: "waiting", resumeAt: { lte: new Date() } },
    take: 200,
  });

  for (const run of due) {
    if (!run.currentNodeId) continue;
    try {
      await resumeFlowRun(run.id, run.currentNodeId);
    } catch (error) {
      log("sweep", `failed to resume ${run.id}`, (error as Error).message);
    }
  }
  if (due.length) log("sweep", `resumed ${due.length} stalled runs`);

  // Runs parked past the messaging window can never send again — close them
  // with an honest reason instead of leaving them "waiting" forever.
  const stale = await prisma.flowRun.updateMany({
    where: {
      status: "waiting",
      resumeAt: { lte: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    },
    data: {
      status: "halted",
      haltReason: "Instagram's 24-hour messaging window closed before this step could run.",
      completedAt: new Date(),
    },
  });
  if (stale.count) log("sweep", `closed ${stale.count} runs past the messaging window`);
}

for (const worker of workers) {
  worker.on("failed", (job: Job | undefined, error: Error) => {
    log("worker", `job ${job?.name ?? "?"} (${job?.id ?? "?"}) failed: ${error.message}`);
  });
  worker.on("error", (error: Error) => {
    log("worker", `worker error: ${error.message}`);
  });
}

async function main() {
  if (!(await redisAvailable())) {
    log("worker", "Redis is not reachable. Set REDIS_URL and restart — flows with delays need it.");
  }
  await scheduleMaintenance();
  log("worker", `running: ${Object.values(QUEUE_NAMES).join(", ")}`);
}

async function shutdown(signal: string) {
  log("worker", `${signal} received, shutting down`);
  await Promise.all(workers.map((w) => w.close()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void main();
