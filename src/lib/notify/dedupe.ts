import { getRedis } from "@/lib/redis";

/**
 * Redis-backed "have we already done this" guard for the interval-based
 * worker ticks (worker/src/notify-tick.ts) — contest-starting-soon and the
 * daily digest must each fire exactly once, not once per tick. Returns
 * `true` (treat as "already sent") when Redis is unavailable, since without
 * a shared store there is no safe way to dedupe across ticks/instances and
 * spamming on every tick is worse than skipping.
 */
export async function alreadySent(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const exists = await redis.exists(key);
  return exists === 1;
}

export async function markSent(key: string, ttlSec: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, "1", "EX", ttlSec);
}
