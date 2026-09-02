import { getRedis } from "../redis";

/**
 * Per-user in-flight cap (D3): a student who queues 15 submissions must not
 * starve 15 other students. Enforced with an atomic Redis counter checked at
 * claim time — a Postgres query per claim attempt would be too slow at
 * contest scale. `acquireUserSlot` is called by the worker right before
 * `claimSubmission`; on any non-claim outcome (already claimed elsewhere,
 * finished, or an error) the caller must `releaseUserSlot` again.
 */
const MAX_IN_FLIGHT_PER_USER = 2;
const SLOT_TTL_SEC = 120; // self-heals if a worker dies without releasing

const ACQUIRE_LUA = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = tonumber(redis.call("GET", key) or "0")
if current >= max then
  return 0
end
local updated = redis.call("INCR", key)
redis.call("EXPIRE", key, ttl)
return updated
`;

function keyFor(userId: string): string {
  return `fairness:user:${userId}`;
}

/** Returns true if a slot was acquired (and must later be released). */
export async function acquireUserSlot(userId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // no Redis => no fairness cap, fail open
  const result = await redis.eval(ACQUIRE_LUA, 1, keyFor(userId), MAX_IN_FLIGHT_PER_USER, SLOT_TTL_SEC);
  return Number(result) > 0;
}

export async function releaseUserSlot(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = keyFor(userId);
  const value = await redis.decr(key);
  if (value <= 0) await redis.del(key);
}

export function _maxInFlightPerUser(): number {
  return MAX_IN_FLIGHT_PER_USER;
}
