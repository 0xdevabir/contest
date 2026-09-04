import { prisma } from "./db";
import { getQueueStats } from "./queue-stats";
import { log } from "./log";

/**
 * Phase 13 Part 5 — computes the 8 SLO rows from
 * docs/phases/PHASE-13-scale-ops.md Part 5's table against whatever data is
 * actually available today. Several of the doc's metrics have no real
 * telemetry source yet (true web-availability tracking, submit-ack latency,
 * scoreboard staleness, a general error-rate feed) — those return
 * `status: "unknown"` with a note explaining why, rather than a fabricated
 * number. Backs both the `/admin/system` SLO section and
 * `worker/src/slo-alert-tick.ts`.
 */

export type SloStatus = "ok" | "warn" | "breach" | "unknown";

export type SloRow = {
  /** Stable machine key, also used as the alert id in the runbook. */
  key: string;
  slo: string;
  status: SloStatus;
  /** Present when a real value was computed. */
  value?: number;
  unit?: string;
  target: string;
  window: string;
  note?: string;
};

/** value <= target -> ok; <= target * warnFactor -> warn; else breach. */
function statusFor(value: number, target: number, warnFactor = 1.5): SloStatus {
  if (value <= target) return "ok";
  if (value <= target * warnFactor) return "warn";
  return "breach";
}

async function verdictP95Ms(scope: "idle" | "contest"): Promise<number | null> {
  try {
    const rows =
      scope === "contest"
        ? await prisma.$queryRaw<Array<{ p95: number | null }>>`
            SELECT percentile_cont(0.95) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM ("judgedAt" - "queuedAt")) * 1000
            ) AS p95
            FROM "Submission"
            WHERE state = 'DONE' AND "queuedAt" IS NOT NULL AND "judgedAt" IS NOT NULL
              AND "judgedAt" >= now() - interval '1 hour' AND "contestId" IS NOT NULL
          `
        : await prisma.$queryRaw<Array<{ p95: number | null }>>`
            SELECT percentile_cont(0.95) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM ("judgedAt" - "queuedAt")) * 1000
            ) AS p95
            FROM "Submission"
            WHERE state = 'DONE' AND "queuedAt" IS NOT NULL AND "judgedAt" IS NOT NULL
              AND "judgedAt" >= now() - interval '1 hour' AND "contestId" IS NULL
          `;
    const p95 = rows[0]?.p95;
    return p95 == null ? null : Math.round(p95);
  } catch (err) {
    log.error("verdict p95 SLO query failed", { scope }, err);
    return null;
  }
}

/** Samples a handful of `SELECT 1` round trips right now and takes the p95 of
 * those samples. Honest label: this is a live sample, not a real 1h rolling
 * window — nothing in the repo persists per-query latency history yet. */
async function dbQueryP95Ms(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const idx = Math.min(samples.length - 1, Math.ceil(0.95 * samples.length) - 1);
  return Math.max(1, Math.round(samples[idx]));
}

export async function computeSloRows(): Promise<SloRow[]> {
  const rows: SloRow[] = [];

  // 1. Web availability — no uptime-check/synthetic-monitoring source exists
  // in this repo (Sentry tracks errors, not request-level availability).
  rows.push({
    key: "web-availability",
    slo: "Web availability",
    status: "unknown",
    target: "99.9%",
    window: "30d",
    note: "No uptime/synthetic-monitoring source wired up yet.",
  });

  // 2. Judge availability (IE rate) — getQueueStats()'s 5-minute rolling
  // window, not the doc's 7-day window; noted honestly rather than relabeled.
  try {
    const stats = await getQueueStats();
    const value = stats.ieRatePercent;
    rows.push({
      key: "judge-availability",
      slo: "Judge availability (IE rate)",
      status: statusFor(value, 0.5),
      value,
      unit: "%",
      target: "< 0.5%",
      window: "5m (rolling; doc target window is 7d)",
    });
  } catch (err) {
    log.error("judge availability SLO computation failed", {}, err);
    rows.push({
      key: "judge-availability",
      slo: "Judge availability (IE rate)",
      status: "unknown",
      target: "< 0.5%",
      window: "7d",
      note: "Queue stats query failed — see server logs.",
    });
  }

  // 3. Submit acknowledgement p95 — request-accept latency isn't recorded
  // anywhere; would need request-timing middleware, not built yet.
  rows.push({
    key: "submit-ack-p95",
    slo: "Submit acknowledgement p95",
    status: "unknown",
    target: "< 150ms",
    window: "1h",
    note: "No request-timing telemetry for the submit endpoint yet.",
  });

  // 4 & 5. Verdict p95, idle vs. contest — from Submission.queuedAt/judgedAt.
  const idleP95 = await verdictP95Ms("idle");
  rows.push({
    key: "verdict-p95-idle",
    slo: "Verdict p95 (idle)",
    status: idleP95 == null ? "unknown" : statusFor(idleP95, 3000),
    value: idleP95 ?? undefined,
    unit: idleP95 == null ? undefined : "ms",
    target: "< 3s",
    window: "1h",
    note: idleP95 == null ? "No idle (non-contest) DONE submissions judged in the last hour." : undefined,
  });

  const contestP95 = await verdictP95Ms("contest");
  rows.push({
    key: "verdict-p95-contest",
    slo: "Verdict p95 (contest)",
    status: contestP95 == null ? "unknown" : statusFor(contestP95, 20_000),
    value: contestP95 ?? undefined,
    unit: contestP95 == null ? undefined : "ms",
    target: "< 20s",
    window: "live",
    note: contestP95 == null ? "No contest DONE submissions judged in the last hour." : undefined,
  });

  // 6. Scoreboard staleness p95 — the live-standings debounce interval
  // (worker/src/standings-tick.ts) is fixed at 2s, but nothing records the
  // actual end-to-end staleness a viewer experienced.
  rows.push({
    key: "scoreboard-staleness-p95",
    slo: "Scoreboard staleness p95",
    status: "unknown",
    target: "< 5s",
    window: "live",
    note: "Standings tick runs every 2s (worker/src/standings-tick.ts) but per-view staleness isn't measured.",
  });

  // 7. DB query p95 — sampled live, not a real rolling window (see note).
  try {
    const value = await dbQueryP95Ms();
    rows.push({
      key: "db-query-p95",
      slo: "DB query p95",
      status: statusFor(value, 50),
      value,
      unit: "ms",
      target: "< 50ms",
      window: "sampled now (doc target window is 1h)",
    });
  } catch (err) {
    log.error("DB query p95 SLO computation failed", {}, err);
    rows.push({
      key: "db-query-p95",
      slo: "DB query p95",
      status: "unknown",
      target: "< 50ms",
      window: "1h",
      note: "SELECT 1 sampling failed — see server logs.",
    });
  }

  // 8. Error rate — no general application error-rate feed (Sentry captures
  // exceptions but this repo doesn't query the Sentry API for a rate).
  rows.push({
    key: "error-rate",
    slo: "Error rate",
    status: "unknown",
    target: "< 0.1%",
    window: "1h",
    note: "No queryable error-rate source — Sentry captures exceptions but isn't polled here.",
  });

  return rows;
}
