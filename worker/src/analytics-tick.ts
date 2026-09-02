import { runAnalyticsRollup } from "@/lib/analytics/rollup";
import { log } from "@/lib/log";

/**
 * PHASE-08 D1 — "nightly rollup jobs so nothing is computed live at page
 * load". Runs on an interval like worker/src/contest-tick.ts rather than a
 * literal once-a-night cron: every job here is incremental (a watermark on
 * Submission.createdAt/id for the per-user jobs; SectionStat is a bounded
 * full recompute per active section), so running it more often just keeps
 * the rollup tables fresher — it never redoes work.
 */
const TICK_INTERVAL_MS = Number(process.env.ANALYTICS_TICK_INTERVAL_MS ?? 6 * 60 * 60_000); // 6h default

async function tick(): Promise<void> {
  try {
    const result = await runAnalyticsRollup();
    log.info("analytics rollup tick", result);
  } catch (err) {
    log.error("analytics rollup tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("analytics rollup scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("analytics rollup scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("analytics rollup scheduler crashed on startup", {}, err);
  process.exit(1);
});
