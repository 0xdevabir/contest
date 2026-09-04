import { prisma } from "./db";
import { getRedis } from "./redis";

const SET_KEY = "live-contest-problems";

/**
 * D1: "Determining is this problem in a live contest on every problem page
 * view must not be a query. Maintain a Redis set... updated by the contest
 * lifecycle tick." Called once a minute from runContestLifecycleTick() —
 * cheap enough to fully rebuild rather than diff incrementally.
 */
export async function refreshLiveContestProblemsSet(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const rows = await prisma.contestProblem.findMany({
    where: { contest: { status: "LIVE" } },
    select: { problemId: true },
  });
  const ids = Array.from(new Set(rows.map((r) => r.problemId)));

  if (ids.length === 0) {
    await redis.del(SET_KEY);
    return;
  }
  await redis.multi().del(SET_KEY).sadd(SET_KEY, ...ids).exec();
}

/**
 * Spoiler-gating read path (D1). Prefers the Redis set (no query on the hot
 * path); falls back to a direct DB check when Redis is unavailable — unlike
 * this repo's other Redis-optional fallbacks (which fail open for caching or
 * rate limits), this one must stay *correct* without Redis, since it guards
 * against leaking a live contest's solution.
 */
export async function isProblemInLiveContest(problemId: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const hit = await redis.sismember(SET_KEY, problemId);
    return hit === 1;
  }
  const count = await prisma.contestProblem.count({
    where: { problemId, contest: { status: "LIVE" } },
  });
  return count > 0;
}
