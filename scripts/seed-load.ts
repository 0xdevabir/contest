/**
 * Phase 13 Part 8 — synthetic load dataset for `Submission`.
 *
 * Generates a statistically plausible large `Submission` table so pages that
 * only get slow at real volume (profile pages, contest standings, analytics,
 * search) can be measured against something realistic rather than a handful
 * of rows. Testing against uniformly random data measures the wrong thing
 * (docs/phases/PHASE-13-scale-ops.md's Testing plan is explicit about this),
 * so this script deliberately shapes three distributions:
 *
 *   - Verdict distribution: mostly AC/WA/TLE in realistic proportions, not
 *     a uniform draw across all 13 `Verdict` enum values.
 *   - Temporal clustering: submissions cluster around contest windows (real
 *     `Contest.startsAt`/`endsAt` rows if any exist, otherwise synthetic
 *     windows spread over the last 6 months) rather than being scattered
 *     uniformly across time.
 *   - Per-user activity follows a power law: a small fraction of users
 *     account for most submissions, most users submit rarely — matching how
 *     a real judge's traffic actually looks (a few grinders, many one-off
 *     submitters), instead of every user submitting the same expected count.
 *
 * This reuses real `User`/`Problem` rows (`prisma/seed.ts` already seeds an
 * institution, an admin, and the legacy problem bank via
 * `data/problems.json`) rather than creating a parallel fixture system — run
 * `npm run db:seed` first if the database is otherwise empty. Users beyond
 * what's already seeded are NOT created here; if fewer than a handful of
 * users/problems exist, the script errors out with instructions rather than
 * silently generating a degenerate dataset.
 *
 * Usage:
 *   npx tsx scripts/seed-load.ts [--count 100000] [--batch-size 2000]
 *
 * Scaling to a real 10M-row load test (docs/phases/PHASE-13-scale-ops.md's
 * "10M-row submissions table" load-test tier):
 *   npx tsx scripts/seed-load.ts --count 10000000 --batch-size 5000
 * At 10M rows this takes a while and generates real load on the target
 * database — run it against a scratch/staging database, never production,
 * and expect it to take from tens of minutes to a few hours depending on the
 * database tier. `prisma.submission.createMany` in chunks (default 2000,
 * override with --batch-size) keeps any single query from blowing past
 * Postgres's parameter limits or Neon's statement timeout; increase
 * --batch-size on a beefier database to trade fewer round trips for larger
 * transactions, or decrease it if you see timeouts.
 */
import { prisma } from "../src/lib/db";
import type { Verdict } from "@prisma/client";

const DEFAULT_COUNT = 100_000;
const DEFAULT_BATCH_SIZE = 2_000;

function parseArgs(): { count: number; batchSize: number } {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: number) => {
    const i = args.indexOf(`--${flag}`);
    if (i < 0) return fallback;
    const v = Number(args[i + 1]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    count: get("count", DEFAULT_COUNT),
    batchSize: get("batch-size", DEFAULT_BATCH_SIZE),
  };
}

/**
 * Realistic verdict mix for a C-programming judge: most submissions
 * eventually pass (AC), a large chunk fail on logic (WA), a meaningful
 * minority time out or crash, and everything else is rare. Proportions are
 * a judgment call informed by typical intro-CS judge traffic, not a cited
 * dataset — the point is "not uniform across 13 enum values," not precision.
 */
const VERDICT_WEIGHTS: [Verdict, number][] = [
  ["AC", 0.42],
  ["WA", 0.28],
  ["CE", 0.1],
  ["TLE", 0.08],
  ["RE", 0.06],
  ["MLE", 0.02],
  ["PA", 0.02],
  ["IE", 0.01],
  ["OLE", 0.01],
];

function weightedVerdict(rand: () => number): Verdict {
  const r = rand();
  let cumulative = 0;
  for (const [verdict, weight] of VERDICT_WEIGHTS) {
    cumulative += weight;
    if (r <= cumulative) return verdict;
  }
  return "AC";
}

/** Mulberry32 PRNG — deterministic given a seed, no external dependency. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Zipf-ish power-law weighting over a ranked list of users: rank i (1-based)
 * gets weight 1/i^s. A handful of top-ranked users end up with an outsized
 * share of submissions; the long tail submits once or twice. s=1.1 is a mild
 * skew — steep enough to be clearly non-uniform without a single user
 * absorbing an unrealistic fraction of a 100k-row run.
 */
function buildPowerLawWeights(n: number, s = 1.1): number[] {
  const weights: number[] = [];
  let total = 0;
  for (let i = 1; i <= n; i++) {
    const w = 1 / Math.pow(i, s);
    weights.push(w);
    total += w;
  }
  return weights.map((w) => w / total);
}

function weightedIndex(cumulative: number[], rand: () => number): number {
  const r = rand();
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

type TimeWindow = { start: number; end: number };

/** Real contest windows if any exist, else synthetic windows over the last 6 months. */
async function buildTimeWindows(): Promise<TimeWindow[]> {
  const contests = await prisma.contest.findMany({
    where: { startsAt: { not: null }, endsAt: { not: null } },
    select: { startsAt: true, endsAt: true },
    take: 200,
  });
  const real: TimeWindow[] = contests
    .filter((c) => c.startsAt && c.endsAt)
    .map((c) => ({ start: c.startsAt!.getTime(), end: c.endsAt!.getTime() }));
  if (real.length > 0) return real;

  const now = Date.now();
  const sixMonthsMs = 1000 * 60 * 60 * 24 * 30 * 6;
  const synthetic: TimeWindow[] = [];
  for (let i = 0; i < 12; i++) {
    const windowStart = now - sixMonthsMs + (i * sixMonthsMs) / 12;
    synthetic.push({ start: windowStart, end: windowStart + 1000 * 60 * 60 * 3 }); // 3h contest window
  }
  return synthetic;
}

function randomTimestampInWindows(windows: TimeWindow[], rand: () => number): Date {
  // 80% of submissions cluster inside a contest window (practice submissions
  // are the other 20%, spread uniformly across the full span of windows).
  const clustered = rand() < 0.8;
  if (clustered) {
    const w = windows[Math.floor(rand() * windows.length)];
    return new Date(w.start + rand() * Math.max(1, w.end - w.start));
  }
  const spanStart = Math.min(...windows.map((w) => w.start));
  const spanEnd = Math.max(...windows.map((w) => w.end));
  return new Date(spanStart + rand() * Math.max(1, spanEnd - spanStart));
}

async function main() {
  const { count, batchSize } = parseArgs();
  const rand = mulberry32(42);

  const [users, problems] = await Promise.all([
    prisma.user.findMany({ select: { id: true }, take: 5000 }),
    prisma.problem.findMany({ select: { id: true, slug: true }, take: 2000 }),
  ]);

  if (users.length === 0 || problems.length === 0) {
    console.error(
      "seed-load: need at least one User and one Problem row already in the database. " +
        "Run `npm run db:seed` first (see prisma/seed.ts)."
    );
    process.exitCode = 1;
    return;
  }

  const windows = await buildTimeWindows();

  const userWeights = buildPowerLawWeights(users.length);
  const userCumulative: number[] = [];
  {
    let acc = 0;
    for (const w of userWeights) {
      acc += w;
      userCumulative.push(acc);
    }
  }

  console.log(
    `seed-load: generating ${count.toLocaleString()} submissions across ${users.length} users and ` +
      `${problems.length} problems, batches of ${batchSize.toLocaleString()}...`
  );

  const started = Date.now();
  let written = 0;

  while (written < count) {
    const thisBatchSize = Math.min(batchSize, count - written);
    const rows = [];
    for (let i = 0; i < thisBatchSize; i++) {
      const user = users[weightedIndex(userCumulative, rand)];
      const problem = problems[Math.floor(rand() * problems.length)];
      const verdict = weightedVerdict(rand);
      const createdAt = randomTimestampInWindows(windows, rand);
      const isAc = verdict === "AC";
      rows.push({
        userId: user.id,
        problemId: problem.slug,
        problemRefId: problem.id,
        code: "int main(){return 0;}",
        language: "c",
        verdict,
        state: "DONE" as const,
        score: isAc ? 100 : verdict === "PA" ? Math.floor(rand() * 90) + 1 : 0,
        maxScore: 100,
        timeMs: Math.floor(rand() * 2000),
        maxCpuMs: Math.floor(rand() * 2000),
        maxWallMs: Math.floor(rand() * 2500),
        maxMemoryKb: Math.floor(rand() * 65536) + 1024,
        createdAt,
        judgedAt: createdAt,
      });
    }
    await prisma.submission.createMany({ data: rows });
    written += thisBatchSize;
    const pct = ((written / count) * 100).toFixed(1);
    console.log(`  ${written.toLocaleString()} / ${count.toLocaleString()} (${pct}%)`);
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`seed-load: done — ${written.toLocaleString()} rows in ${elapsedSec}s.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
