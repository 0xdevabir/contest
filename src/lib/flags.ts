import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { log } from "./log";

/**
 * Every phase from Phase 1 onward ships behind one of these flags. Phase 0
 * only introduces the mechanism — nothing gates on it yet.
 */
export type Flag =
  | "institutions"
  | "teacherRole"
  | "problemDb"
  | "judgeV2"
  | "judgeQueue"
  | "classroom"
  | "ratings"
  | "integrity"
  | "contestV2"
  | "liveContest"
  | "analytics";

export type FlagContext = { userId?: string; role?: Role };

type CacheEntry = { value: boolean; expiresAt: number };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function envKey(flag: Flag): string {
  // camelCase -> SCREAMING_SNAKE_CASE, e.g. "judgeV2" -> "JUDGE_V2".
  const snake = flag
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
  return `FLAGS_${snake}`;
}

/** Deterministic 0-99 bucket for a user, used for percentage rollouts. */
function bucketFor(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

async function resolveFromDb(flag: Flag, ctx?: FlagContext): Promise<boolean> {
  let row;
  try {
    row = await prisma.featureFlag.findUnique({ where: { key: flag } });
  } catch (err) {
    // A flag lookup must never take down the feature it's guarding.
    log.warn("feature flag lookup failed, defaulting to off", {
      flag,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
  if (!row || !row.enabled) return false;

  if (row.allowRoles.length > 0) {
    if (!ctx?.role || !row.allowRoles.includes(ctx.role)) return false;
  }

  if (row.rolloutPercent < 100) {
    if (!ctx?.userId) return false;
    if (bucketFor(ctx.userId) >= row.rolloutPercent) return false;
  }

  return true;
}

/**
 * Resolution order: `FLAGS_<SCREAMING_SNAKE>` env var (exact "1") -> a
 * `FeatureFlag` row (respecting `allowRoles`/`rolloutPercent`) -> false.
 * Results are cached in-process for 30s so a hot path doesn't hit the DB on
 * every request.
 */
export async function isEnabled(flag: Flag, ctx?: FlagContext): Promise<boolean> {
  if (process.env[envKey(flag)] === "1") return true;
  if (process.env[envKey(flag)] === "0") return false;

  const cacheKey = `${flag}:${ctx?.userId ?? ""}:${ctx?.role ?? ""}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const value = await resolveFromDb(flag, ctx);
  cache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/** Test-only: clears the in-process flag cache. */
export function _clearFlagCacheForTests(): void {
  cache.clear();
}
