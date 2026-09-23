import { Queue, type JobsOptions } from "bullmq";
import { getRedis, redisAvailable } from "@/lib/redis";

/**
 * BullMQ queues. See docs/ARCHITECTURE.md.
 *
 * Delays in flows run to 24 hours and broadcasts fan out to thousands of
 * contacts, so the schedule has to survive a deploy — in-memory timers won't do.
 */

export const QUEUE_NAMES = {
  ingest: "ingest",
  flow: "flow",
  dispatch: "dispatch",
  broadcast: "broadcast",
  maintenance: "maintenance",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const registry = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  const existing = registry.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 5_000 },
      // Keep failures around — the Safety Center reads them.
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  });
  registry.set(name, queue);
  return queue;
}

// --- Job payloads -----------------------------------------------------------

export type IngestJob = { webhookEventId: string };

export type FlowJob =
  | { kind: "start"; automationId: string; eventId: string }
  | { kind: "resume"; flowRunId: string; nodeId: string };

export type DispatchJob = {
  accountId: string;
  flowRunId?: string;
  nodeId?: string;
  conversationId?: string;
  contactId: string;
  target: { to: "user"; igsid: string } | { to: "comment"; commentId: string };
  message: unknown;
  source: "automation" | "human" | "ai" | "broadcast";
  humanAgent?: boolean;
  broadcastId?: string;
};

export type BroadcastJob = { broadcastId: string };

export type MaintenanceJob =
  | { kind: "refresh_tokens" }
  | { kind: "rollup_stats" }
  | { kind: "scan_planner" }
  | { kind: "sweep_windows" }
  | { kind: "reengage" }
  | { kind: "publish_due" }
  | { kind: "purge_webhooks" }
  | { kind: "reconcile_plans" };

/**
 * Enqueue, tolerating a missing Redis. Returns false when the job could not be
 * queued so the caller can fall back to running inline.
 */
export async function enqueue(
  name: QueueName,
  jobName: string,
  data: unknown,
  opts?: JobsOptions,
): Promise<boolean> {
  if (!(await redisAvailable())) return false;
  try {
    await getQueue(name).add(jobName, data, opts);
    return true;
  } catch (error) {
    console.error(`[queue:${name}] enqueue failed`, error);
    return false;
  }
}

/** Register the recurring maintenance jobs. Called once by the worker. */
export async function scheduleMaintenance(): Promise<void> {
  if (!(await redisAvailable())) return;
  const queue = getQueue("maintenance");

  const repeating: Array<[string, MaintenanceJob, string]> = [
    ["refresh_tokens", { kind: "refresh_tokens" }, "0 4 * * *"],
    ["rollup_stats", { kind: "rollup_stats" }, "*/15 * * * *"],
    ["scan_planner", { kind: "scan_planner" }, "*/5 * * * *"],
    ["sweep_windows", { kind: "sweep_windows" }, "*/10 * * * *"],
    ["reengage", { kind: "reengage" }, "*/30 * * * *"],
    ["publish_due", { kind: "publish_due" }, "*/2 * * * *"],
    // Enforces the 30-day raw-payload retention the privacy policy promises.
    ["purge_webhooks", { kind: "purge_webhooks" }, "30 4 * * *"],
    // Plan changes driven by the clock alone: an override expiring, a cancelled
    // subscription's paid period ending. Webhooks cover the rest.
    ["reconcile_plans", { kind: "reconcile_plans" }, "*/15 * * * *"],
  ];

  // BullMQ v5+ replaced repeatable jobs with job schedulers. Upserting by a
  // stable id keeps a worker restart from stacking duplicate schedules.
  for (const [name, data, pattern] of repeating) {
    await queue.upsertJobScheduler(
      `repeat:${name}`,
      { pattern },
      { name, data, opts: { removeOnComplete: true } },
    );
  }
}
