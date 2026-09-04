import { runContestLifecycleTick } from "@/lib/contest-lifecycle";
import { log } from "@/lib/log";

/**
 * docs/phases/PHASE-05-contest-engine.md — "the scheduler's contest tick,
 * running every minute". This is a separate entry point from
 * worker/src/index.ts on purpose: that process exits immediately if
 * `REDIS_URL` isn't configured (it's the judge-queue worker), but contest
 * lifecycle (freeze/drain/snapshot) must keep running regardless of whether
 * the judge queue is enabled — most of what it drains is the *synchronous*
 * judge path's occasional straggler, not the queue.
 */
const TICK_INTERVAL_MS = 60_000;

async function tick(): Promise<void> {
  try {
    const result = await runContestLifecycleTick();
    if (result.promoted || result.frozen || result.finalized || result.prewarmed) {
      log.info("contest lifecycle tick", result);
    }
  } catch (err) {
    log.error("contest lifecycle tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("contest lifecycle scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("contest lifecycle scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("contest lifecycle scheduler crashed on startup", {}, err);
  process.exit(1);
});
