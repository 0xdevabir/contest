import { isEnabled } from "@/lib/flags";
import { rateNewlyFinalizedContests } from "@/lib/rating/compute";
import { evaluateNightlyBadges } from "@/lib/badges";
import { log } from "@/lib/log";

/**
 * PHASE-09's "nightly (streak and aggregate rules)" trigger, run on an
 * interval like the other worker ticks rather than a literal cron — badge
 * awarding is idempotent, so running it more often just keeps badges fresher.
 * Also sweeps any finalized contest that hasn't been rated yet, as a
 * belt-and-suspenders backstop to the inline hook in
 * src/lib/contest-lifecycle.ts (e.g. if `ratings` was off when a contest
 * ended and got turned on afterward).
 */
const TICK_INTERVAL_MS = Number(process.env.RATINGS_TICK_INTERVAL_MS ?? 60 * 60_000); // 1h default

async function tick(): Promise<void> {
  try {
    if (!(await isEnabled("ratings"))) return;
    const rating = await rateNewlyFinalizedContests();
    const badges = await evaluateNightlyBadges();
    if (rating.rated || badges.awarded) {
      log.info("ratings tick", { rating, badges });
    }
  } catch (err) {
    log.error("ratings tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("ratings scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("ratings scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("ratings scheduler crashed on startup", {}, err);
  process.exit(1);
});
