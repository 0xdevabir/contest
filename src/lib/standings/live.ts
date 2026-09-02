import { getRedis } from "../redis";
import { getContestDashboard } from "../contest-dashboard";
import { diffStandings } from "./diff";
import { standingsPayloadKey, standingsRankKey, contestEventsChannel, STANDINGS_DIRTY_SET } from "./channel";
import type { ContestDashboardData, EngineInput, ScoreboardRow } from "../scoring/types";

export type CachedStandings = { version: number; dashboard: ContestDashboardData; updatedAt: number };

/**
 * D2 (docs/phases/PHASE-07-live-contest.md) — marks a contest's standings
 * dirty. Called from `applyJudgedSideEffects` after every judged submission
 * that belongs to a live contest. Idempotent: it's a set add, so a burst of
 * N events inside one debounce window still yields exactly one membership.
 * The recompute tick (worker/src/standings-tick.ts) drains this set on a
 * fixed 2s cadence — that fixed cadence *is* the debounce, and it caps
 * recomputation at 30/minute per contest regardless of submission rate.
 */
export async function markStandingsDirty(contestId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.sadd(STANDINGS_DIRTY_SET, contestId);
}

/** Drains up to `limit` dirty contestIds (removing them from the set). */
export async function popDirtyContests(limit = 50): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids: string[] = [];
  for (let i = 0; i < limit; i++) {
    const id = await redis.spop(STANDINGS_DIRTY_SET);
    if (!id) break;
    ids.push(id);
  }
  return ids;
}

type DashboardCtx = { startsAt: Date | null; endsAt: Date | null; rules: EngineInput["rules"]; createdAt: Date };

/**
 * Reads the cached standings payload; on a cache miss (Redis down, or
 * nothing computed yet) falls back to computing straight from Postgres and
 * repopulating the cache, per D2.
 */
export async function getLiveStandings(contestId: string, ctx: DashboardCtx): Promise<CachedStandings> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(standingsPayloadKey(contestId));
    if (raw) {
      try {
        return JSON.parse(raw) as CachedStandings;
      } catch {
        // corrupt cache entry — fall through to a fresh compute
      }
    }
  }
  return recomputeStandings(contestId, ctx);
}

/**
 * Recomputes the standings via the same pure engine the live dashboard uses,
 * diffs against whatever was cached before, writes the new payload + rank
 * zset, and — only when something actually changed — publishes the diff to
 * `contestEventsChannel`. Safe to call with Redis unavailable: it still
 * returns the freshly computed payload, it just can't cache or broadcast it.
 */
export async function recomputeStandings(contestId: string, ctx: DashboardCtx): Promise<CachedStandings> {
  const redis = getRedis();
  const dashboard = await getContestDashboard(contestId, { ...ctx, viewerId: null });

  let previous: ScoreboardRow[] | null = null;
  let version = 1;
  if (redis) {
    const raw = await redis.get(standingsPayloadKey(contestId));
    if (raw) {
      try {
        const cached = JSON.parse(raw) as CachedStandings;
        previous = cached.dashboard.rows;
        version = cached.version + 1;
      } catch {
        /* treat as no previous version */
      }
    }
  }

  const payload: CachedStandings = { version, dashboard, updatedAt: Date.now() };
  if (!redis) return payload;

  const multi = redis.multi().set(standingsPayloadKey(contestId), JSON.stringify(payload));
  multi.del(standingsRankKey(contestId));
  if (dashboard.rows.length > 0) {
    multi.zadd(standingsRankKey(contestId), ...dashboard.rows.flatMap((r) => [r.rank, r.userId]));
  }
  await multi.exec();

  const diff = diffStandings(previous, dashboard.rows, version);
  if (diff.changed.length > 0 || diff.removed.length > 0) {
    await redis.publish(contestEventsChannel(contestId), JSON.stringify({ event: "standings", data: diff }));
  }

  return payload;
}
