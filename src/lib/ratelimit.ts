/**
 * Token-bucket rate limiting. Dispatches to the Redis sliding-window driver
 * (src/lib/ratelimit-redis.ts) when `REDIS_URL` is configured — for
 * multi-instance deployments, this is what makes limits shared across the
 * web app and the queue's Vercel functions — and falls back to this
 * in-memory `Map` driver otherwise. Same `consume()` interface either way,
 * so call sites never change.
 *
 * Buckets in use (see docs/phases/PHASE-00-foundation.md §1.2):
 *   run:anon         IP            10 / 5 min
 *   run:user         userId        60 / 5 min
 *   submit:user      userId        30 / 5 min
 *   submit:problem   userId:problemId  10 / 1 min
 *   auth:login       IP + email    10 / 15 min
 *   auth:forgot      email         3 / 60 min
 *   runticket        IP            5 / 5 min
 */

export type RateLimitKey = { bucket: string; identity: string };
export type RateLimitLimit = { tokens: number; windowSec: number; cost?: number };
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

type BucketState = { tokens: number; resetAt: number };

const buckets = new Map<string, BucketState>();

function keyOf(key: RateLimitKey): string {
  return `${key.bucket}:${key.identity}`;
}

/**
 * A fixed-window counter, not a sliding-window/leaky-bucket. Simpler, and
 * exact enough for abuse-prevention limits at this scale.
 */
function consumeInMemory(key: RateLimitKey, limit: RateLimitLimit): RateLimitResult {
  const now = Date.now();
  const k = keyOf(key);
  const cost = limit.cost ?? 1;
  let state = buckets.get(k);

  if (!state || state.resetAt <= now) {
    state = { tokens: limit.tokens, resetAt: now + limit.windowSec * 1000 };
    buckets.set(k, state);
  }

  if (state.tokens < cost) {
    return { ok: false, remaining: Math.max(0, state.tokens), resetAt: state.resetAt };
  }

  state.tokens -= cost;
  return { ok: true, remaining: state.tokens, resetAt: state.resetAt };
}

export async function consume(key: RateLimitKey, limit: RateLimitLimit): Promise<RateLimitResult> {
  if (process.env.REDIS_URL) {
    try {
      const { consumeRedis } = await import("./ratelimit-redis");
      return await consumeRedis(key, limit);
    } catch {
      // Redis configured but unreachable — fail open to the in-memory driver
      // rather than taking the judge/auth path down with it.
    }
  }
  return consumeInMemory(key, limit);
}

/** Seconds until the given bucket's window resets, for a Retry-After header. */
export function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

/**
 * Global concurrency cap for anonymous judge runs — independent of the
 * per-identity token buckets above. A saturated anonymous run queue returns
 * 429 immediately rather than queueing: a guest waiting 30s for a slot is a
 * worse experience than a clear "try again" and it protects authenticated
 * traffic from being starved by anonymous load.
 *
 * Uses a Redis TTL-guarded counter when configured (correct across multiple
 * web instances); falls back to the single in-process counter otherwise,
 * which is correct only for a single-instance deployment. `tryAcquireAnonRunSlot`
 * stays synchronous — callers (the judge route) are on the hot path and a
 * Redis round trip here would defeat the point — so the Redis path updates
 * an in-memory mirror refreshed opportunistically rather than being awaited
 * per call.
 */
const ANON_RUN_CONCURRENCY = Number(process.env.ANON_RUN_CONCURRENCY || 4);
let anonInFlight = 0;

const ANON_SLOT_KEY = "ratelimit:anon-run:inflight";
const ANON_SLOT_TTL_SEC = 60;

async function redisAdjustAnonSlot(delta: 1 | -1): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    const { getRedis } = await import("./redis");
    const redis = getRedis();
    if (!redis) return;
    if (delta === 1) {
      await redis.multi().incr(ANON_SLOT_KEY).expire(ANON_SLOT_KEY, ANON_SLOT_TTL_SEC).exec();
    } else {
      const value = await redis.decr(ANON_SLOT_KEY);
      if (value <= 0) await redis.del(ANON_SLOT_KEY);
    }
  } catch {
    // best-effort mirror only — the in-process counter below is authoritative
    // for this instance regardless
  }
}

export function tryAcquireAnonRunSlot(): boolean {
  if (anonInFlight >= ANON_RUN_CONCURRENCY) return false;
  anonInFlight++;
  void redisAdjustAnonSlot(1);
  return true;
}

export function releaseAnonRunSlot(): void {
  anonInFlight = Math.max(0, anonInFlight - 1);
  void redisAdjustAnonSlot(-1);
}

export function anonRunSlotsInFlight(): number {
  return anonInFlight;
}

/** Test-only: clears all bucket and concurrency state between test cases. */
export function _resetRateLimitsForTests(): void {
  buckets.clear();
  anonInFlight = 0;
}
