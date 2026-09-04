import { applyHetznerScaling, decideAutoscale } from "@/lib/autoscale";
import { log } from "@/lib/log";

/**
 * docs/phases/PHASE-13-scale-ops.md Part 4 — queue-depth autoscaling.
 * Separate process from worker/src/index.ts (the judge worker itself) on
 * purpose: it must keep polling and logging decisions even when the judge
 * queue is disabled or Hetzner isn't configured, since the decision log is
 * useful signal on its own. `decideAutoscale()`/`applyHetznerScaling()` are
 * both gated internally (scaleOps flag, HETZNER_API_TOKEN) and never throw.
 */
const TICK_INTERVAL_MS = 30_000;

async function tick(): Promise<void> {
  try {
    const decision = await decideAutoscale();
    if (decision.action !== "none") {
      log.info("autoscale decision", decision);
      await applyHetznerScaling(decision);
    }
  } catch (err) {
    log.error("autoscale tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("autoscale scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("autoscale scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("autoscale scheduler crashed on startup", {}, err);
  process.exit(1);
});
