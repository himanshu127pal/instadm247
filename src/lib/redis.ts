import IORedis, { type Redis } from "ioredis";
import { env } from "./env";

/**
 * Shared Redis connection.
 *
 * Redis backs both BullMQ and the per-account token buckets. When it isn't
 * reachable the app must still serve the dashboard — callers use
 * `redisAvailable()` and degrade to inline execution rather than crashing.
 */

const globalForRedis = globalThis as unknown as { redis?: Redis; redisDown?: boolean };

export function getRedis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;

  const client = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  });

  client.on("error", (err) => {
    if (!globalForRedis.redisDown) {
      globalForRedis.redisDown = true;
      console.error("[redis] connection error:", err.message);
    }
  });
  client.on("ready", () => {
    globalForRedis.redisDown = false;
  });

  globalForRedis.redis = client;
  return client;
}

export async function redisAvailable(): Promise<boolean> {
  try {
    const res = await getRedis().ping();
    return res === "PONG";
  } catch {
    return false;
  }
}
