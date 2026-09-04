import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { getRatingLeaderboard } from "@/lib/rating-leaderboard";
import { getPracticeLeaderboard } from "@/lib/leaderboard";

/**
 * Phase 13 Part 2 — "Practice leaderboard: materialised hourly into
 * `LeaderboardCache`" / "National leaderboard: same" (docs/phases/
 * PHASE-13-scale-ops.md). This tick is intentionally thin: the actual
 * ranking logic already lives in src/lib/rating-leaderboard.ts and
 * src/lib/leaderboard.ts (reused as-is, same query shape the live pages
 * use), so this process just runs those on a schedule and upserts the
 * result under a stable key. Upserting by `key` makes every run idempotent
 * — running it twice in a row just recomputes the same rows.
 *
 * Key format per the phase doc's examples: "national:rating:alltime",
 * "inst:<institutionSlug>:solved:30d". `LeaderboardRange` doesn't have a
 * literal "30d" bucket (it's "all" | "month" | "week") — "month" (30-day
 * cutoff) is what backs every "30d" key below.
 */
const TICK_INTERVAL_MS = Number(process.env.LEADERBOARD_TICK_INTERVAL_MS ?? 60 * 60_000); // 1h default

async function upsert(key: string, payload: unknown): Promise<void> {
  await prisma.leaderboardCache.upsert({
    where: { key },
    create: { key, payload: payload as object, computedAt: new Date() },
    update: { payload: payload as object, computedAt: new Date() },
  });
}

async function materializeNational(): Promise<number> {
  let count = 0;

  for (const range of ["all", "30d"] as const) {
    const result = await getRatingLeaderboard({ scope: "national", metric: "rating", range });
    await upsert(`national:rating:${range === "all" ? "alltime" : "30d"}`, result);
    count += 1;
  }

  for (const range of ["all", "month"] as const) {
    const result = await getPracticeLeaderboard({ verifiedOnly: true, sort: "solved", range });
    await upsert(`national:solved:${range === "all" ? "alltime" : "30d"}`, result);
    count += 1;
  }

  return count;
}

async function materializeInstitutions(): Promise<number> {
  const institutions = await prisma.institution.findMany({
    where: { verified: true },
    select: { id: true, slug: true },
  });

  let count = 0;
  for (const inst of institutions) {
    for (const range of ["all", "month"] as const) {
      const result = await getPracticeLeaderboard({ institutionId: inst.id, sort: "solved", range });
      await upsert(`inst:${inst.slug}:solved:${range === "all" ? "alltime" : "30d"}`, result);
      count += 1;
    }
  }
  return count;
}

async function tick(): Promise<void> {
  try {
    const national = await materializeNational();
    const institutions = await materializeInstitutions();
    log.info("leaderboard tick", { national, institutions });
  } catch (err) {
    log.error("leaderboard tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("leaderboard scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("leaderboard scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("leaderboard scheduler crashed on startup", {}, err);
  process.exit(1);
});
