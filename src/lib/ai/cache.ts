import { createHash } from "crypto";
import { getRedis } from "../redis";
import { log } from "../log";
import type { AiJobKind } from "@prisma/client";

/**
 * D2 (docs/phases/PHASE-15-intelligence.md) — "the same problem's editorial
 * draft requested twice should not cost twice." Keyed on a hash of the
 * exact input payload, 30-day TTL in Redis. Exposes explicit get/set
 * (rather than src/lib/cache.ts's getOrSet) because src/lib/ai/job.ts needs
 * to know hit-vs-miss to record zero cost on a cache hit — Redis being
 * unset/unreachable degrades to "always a miss", never an error.
 */

const TTL_SEC = 30 * 24 * 60 * 60;

export function hashInput(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function cacheKey(kind: AiJobKind, inputHash: string): string {
  return `ai:cache:${kind}:${inputHash}`;
}

export async function getCachedResponse<T>(kind: AiJobKind, inputHash: string): Promise<T | undefined> {
  const redis = getRedis();
  if (!redis) return undefined;
  try {
    const raw = await redis.get(cacheKey(kind, inputHash));
    return raw != null ? (JSON.parse(raw) as T) : undefined;
  } catch (err) {
    log.warn("ai response cache read failed, treating as miss", { kind, error: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

export async function setCachedResponse(kind: AiJobKind, inputHash: string, value: unknown): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(cacheKey(kind, inputHash), TTL_SEC, JSON.stringify(value));
  } catch (err) {
    log.warn("ai response cache write failed", { kind, error: err instanceof Error ? err.message : String(err) });
  }
}
