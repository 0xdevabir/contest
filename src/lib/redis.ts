import Redis from "ioredis";
import { log } from "./log";

/**
 * Lazy singleton Redis client shared by the queue, pub/sub, and the Redis
 * rate-limit driver. Returns `null` when `REDIS_URL` is unset — every caller
 * must treat that as "queue/Redis unavailable" (see docs/phases/
 * DONE__PHASE-04-judge-queue.md D1: a total Redis loss is a 5-minute
 * recovery, not an incident, because nothing here is authoritative).
 *
 * `maxRetriesPerRequest: null` is required by BullMQ's blocking connections;
 * a plain retry-until-connected `lazyConnect` avoids crashing the process on
 * a transient outage.
 */
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }

  const instance = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  instance.on("error", (err) => {
    log.warn("redis connection error", { error: err instanceof Error ? err.message : String(err) });
  });
  client = instance;
  return client;
}

/** True when Redis is configured AND currently reachable. */
export async function redisAvailable(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.ping();
    return true;
  } catch {
    return false;
  }
}

/** Test-only: forces the singleton to re-resolve `REDIS_URL` on next call. */
export function _resetRedisClientForTests(): void {
  client?.disconnect();
  client = undefined;
}
