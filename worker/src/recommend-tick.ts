import { isEnabled } from "@/lib/flags";
import { pollRecommendationBatch, submitRecommendationBatch } from "@/lib/ai/recommend/precompute";
import { log } from "@/lib/log";

/**
 * D4 (docs/phases/PHASE-15-intelligence.md) — "Nightly job: score every
 * candidate problem for every active user... batch-generate one-line
 * rationales." Each tick either polls a pending Batch API job (if one is
 * outstanding) or submits a fresh one — never both, since a batch can take
 * up to 24h. See src/lib/ai/recommend/precompute.ts for the two-phase
 * design.
 */
const TICK_INTERVAL_MS = Number(process.env.RECOMMEND_TICK_INTERVAL_MS ?? 6 * 60 * 60_000); // 6h default

async function tick(): Promise<void> {
  if (!(await isEnabled("ai"))) return;
  try {
    const polled = await pollRecommendationBatch();
    if (polled.polled) {
      log.info("recommend tick: polled pending batch", polled);
      return;
    }
    const submitted = await submitRecommendationBatch();
    log.info("recommend tick: submitted batch", submitted);
  } catch (err) {
    log.error("recommend tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("recommend scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("recommend scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("recommend scheduler crashed on startup", {}, err);
  process.exit(1);
});
