/**
 * Token-bucket rate limiting. In-memory `Map` driver for local dev and
 * single-instance deployments; Phase 4 swaps in a Redis driver behind the same
 * `consume()` interface so call sites never change.
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
 * exact enough for abuse-prevention limits at this scale — the Redis driver in
 * Phase 4 can upgrade to sliding-window without changing this signature.
 */
export async function consume(key: RateLimitKey, limit: RateLimitLimit): Promise<RateLimitResult> {
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

/** Seconds until the given bucket's window resets, for a Retry-After header. */
export function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

/**
 * Global concurrency cap for anonymous judge runs — independent of the
 * per-identity token buckets above. A saturated anonymous run queue returns
 * 429 immediately rather than queueing: a guest waiting 30s for a slot is a
 * worse experience than a clear "try again" and it protects authenticated
 * traffic from being starved by anonymous load. Becomes a Redis counter in
 * Phase 4 for multi-instance deployments; single in-process counter is
 * correct for the current single-instance topology.
 */
const ANON_RUN_CONCURRENCY = Number(process.env.ANON_RUN_CONCURRENCY || 4);
let anonInFlight = 0;

export function tryAcquireAnonRunSlot(): boolean {
  if (anonInFlight >= ANON_RUN_CONCURRENCY) return false;
  anonInFlight++;
  return true;
}

export function releaseAnonRunSlot(): void {
  anonInFlight = Math.max(0, anonInFlight - 1);
}

export function anonRunSlotsInFlight(): number {
  return anonInFlight;
}

/** Test-only: clears all bucket and concurrency state between test cases. */
export function _resetRateLimitsForTests(): void {
  buckets.clear();
  anonInFlight = 0;
}
