import { getRedis } from "./redis";
import { log } from "./log";

/**
 * Phase 13 Part 2 — the shared read-model cache. "Cache rule" (docs/phases/
 * PHASE-13-scale-ops.md): every cached value must be reconstructible from
 * Postgres, and every cache read must have a working miss path. `getOrSet`
 * is the one place that rule is enforced: Redis is tried first, an
 * in-process `Map` (same TTL-cache shape as src/lib/flags.ts) is the
 * fallback when Redis is unset/unreachable, and `fn()` — the Postgres
 * source of truth — is always the last resort. A cache read must never
 * throw and must never block a response on Redis being up.
 */

type MemEntry = { value: unknown; expiresAt: number };
const memCache = new Map<string, MemEntry>();

function memGet<T>(key: string): T | undefined {
  const entry = memCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function memSet(key: string, value: unknown, ttlSec: number): void {
  memCache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

/**
 * Redis GET -> in-process Map -> `fn()`. Every successful resolution (Redis
 * hit, memory hit, or a fresh compute) is written back to whichever tiers
 * missed, best-effort — a write failure never surfaces to the caller.
 */
export async function getOrSet<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();

  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw !== null) {
        const value = JSON.parse(raw) as T;
        memSet(key, value, ttlSec);
        return value;
      }
    } catch (err) {
      log.warn("cache redis read failed, falling back", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const mem = memGet<T>(key);
  if (mem !== undefined) return mem;

  const value = await fn();

  memSet(key, value, ttlSec);
  if (redis) {
    try {
      await redis.setex(key, ttlSec, JSON.stringify(value));
    } catch (err) {
      log.warn("cache redis write failed, value served without caching to redis", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return value;
}

/** Test-only: clears the in-process fallback cache. */
export function _clearMemCacheForTests(): void {
  memCache.clear();
}
