import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { popDirtyContests, recomputeStandings } from "@/lib/standings/live";

/**
 * docs/phases/PHASE-07-live-contest.md D2 — the 2s debounce window itself.
 * Every judged contest submission adds its contestId to the
 * `standings:dirty-contests` set (src/lib/submission-effects.ts); this tick
 * drains that set on a fixed cadence and recomputes each contest exactly
 * once per tick, however many submissions landed for it in that window.
 * Separate process from worker/src/index.ts on purpose: it must keep
 * running even when the judge queue itself is disabled, since the
 * synchronous judge path (src/app/api/judge/route.ts) also marks contests
 * dirty.
 */
const TICK_INTERVAL_MS = 2_000;

async function tick(): Promise<void> {
  const contestIds = await popDirtyContests();
  if (contestIds.length === 0) return;

  for (const contestId of contestIds) {
    try {
      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        select: { startsAt: true, endsAt: true, rules: true, createdAt: true },
      });
      if (!contest) continue;
      await recomputeStandings(contestId, contest);
    } catch (err) {
      log.error("standings recompute failed", { contestId }, err);
    }
  }
}

async function main(): Promise<void> {
  log.info("standings tick started", { intervalMs: TICK_INTERVAL_MS });
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("standings tick shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("standings tick crashed on startup", {}, err);
  process.exit(1);
});
