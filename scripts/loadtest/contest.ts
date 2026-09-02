/**
 * Load test driver for the judge queue (docs/phases/DONE__PHASE-04-judge-queue.md
 * "Load testing" section). Plain Node/`fetch` — no k6 dependency, so it runs
 * with `npm run loadtest` against any deployment that exposes /api/judge and
 * /api/submissions/[id]. Requires a real deployment (or `npm run dev` +
 * `npm run worker:dev` locally with FLAGS_JUDGE_QUEUE=1) — nothing here has
 * been run against a live one yet; record real numbers in docs/CAPACITY.md.
 *
 * Usage:
 *   npm run loadtest -- --scenario lab-quiz --base-url http://localhost:3000 \
 *     --cookie "diu_contesthub_session=<token>" --problem-id <id>
 *
 * A single authenticated session cookie is reused across "users" for
 * simplicity — the point of these scenarios is queue/worker throughput
 * under concurrency, not exercising per-user auth. The fairness scenario
 * still measures what it needs to (per-*submission* completion spread)
 * without per-account cookies.
 */

type Args = {
  scenario: string;
  baseUrl: string;
  cookie: string;
  problemId: string;
  code: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(`--${flag}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    scenario: get("scenario", "lab-quiz")!,
    baseUrl: get("base-url", "http://localhost:3000")!,
    cookie: get("cookie", "")!,
    problemId: get("problem-id", "")!,
    code: get("code", "int main(){return 0;}")!,
  };
}

type Sample = { ok: boolean; startMs: number; endMs: number; verdict?: string };

async function submitOne(baseUrl: string, cookie: string, problemId: string, code: string): Promise<Sample> {
  const startMs = Date.now();
  try {
    const submitRes = await fetch(`${baseUrl}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ problemId, code, mode: "submit" }),
    });
    const body = await submitRes.json();

    if (submitRes.status !== 202) {
      // Synchronous path (flag off / Redis down) — already a terminal result.
      return { ok: submitRes.ok, startMs, endMs: Date.now(), verdict: body.verdict };
    }

    const submissionId = body.submissionId as string;
    for (let i = 0; i < 60; i++) {
      const pollRes = await fetch(`${baseUrl}/api/submissions/${submissionId}`, { headers: { Cookie: cookie } });
      const pollBody = await pollRes.json();
      if (pollBody.state === "DONE" || pollBody.state === "FAILED") {
        return { ok: true, startMs, endMs: Date.now(), verdict: pollBody.verdict };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ok: false, startMs, endMs: Date.now(), verdict: "TIMEOUT" };
  } catch {
    return { ok: false, startMs, endMs: Date.now() };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function report(label: string, samples: Sample[]) {
  const durations = samples.map((s) => s.endMs - s.startMs).sort((a, b) => a - b);
  const ieCount = samples.filter((s) => s.verdict === "IE").length;
  console.log(`\n=== ${label} ===`);
  console.log(`n=${samples.length} ok=${samples.filter((s) => s.ok).length} IE=${ieCount}`);
  console.log(`p50=${percentile(durations, 50)}ms p95=${percentile(durations, 95)}ms p99=${percentile(durations, 99)}ms`);
}

async function runConcurrent(count: number, fn: (i: number) => Promise<Sample>): Promise<Sample[]> {
  return Promise.all(Array.from({ length: count }, (_, i) => fn(i)));
}

/** 60 users, 1 submission each within 60s. Pass: p95 <= 15s, zero IE. */
async function labQuiz(a: Args) {
  const samples = await runConcurrent(60, () => submitOne(a.baseUrl, a.cookie, a.problemId, a.code));
  report("Lab quiz (60 users x 1)", samples);
}

/** 200 users, 3 submissions each over 10 min. Pass: p95 <= 25s, queue drains within 60s of last submission. */
async function midterm(a: Args) {
  const samples: Sample[] = [];
  for (let round = 0; round < 3; round++) {
    const batch = await runConcurrent(200, () => submitOne(a.baseUrl, a.cookie, a.problemId, a.code));
    samples.push(...batch);
    if (round < 2) await new Promise((r) => setTimeout(r, 200_000)); // spread across ~10 min
  }
  report("Midterm (200 users x 3, spread over 10m)", samples);
}

/** 300 submissions in 30s (the classic last-minute rush). Pass: no web request > 500ms, no dropped jobs. */
async function contestBurst(a: Args) {
  const samples = await runConcurrent(300, () => submitOne(a.baseUrl, a.cookie, a.problemId, a.code));
  report("Contest burst (300 in ~30s)", samples);
}

/** 1 user submits 20, 20 users submit 1. Pass: the 20 single-submitters' p95 <= 2x baseline. */
async function fairness(a: Args) {
  const [heavy, light] = await Promise.all([
    runConcurrent(20, () => submitOne(a.baseUrl, a.cookie, a.problemId, a.code)),
    runConcurrent(20, () => submitOne(a.baseUrl, a.cookie, a.problemId, a.code)),
  ]);
  report("Fairness — heavy user (20 submissions)", heavy);
  report("Fairness — 20 single-submitters", light);
}

const SCENARIOS: Record<string, (a: Args) => Promise<void>> = {
  "lab-quiz": labQuiz,
  midterm,
  "contest-burst": contestBurst,
  fairness,
};

async function main() {
  const args = parseArgs();
  if (!args.problemId) {
    console.error("Usage: npm run loadtest -- --scenario <name> --problem-id <id> --cookie <session cookie>");
    console.error(`Scenarios: ${Object.keys(SCENARIOS).join(", ")}`);
    console.error(
      "\nNote: 'worker-death' and 'redis-restart' scenarios from the phase doc are manual — " +
        "kill the worker process / restart Redis mid-run of another scenario and confirm zero lost submissions."
    );
    process.exit(1);
  }
  const runner = SCENARIOS[args.scenario];
  if (!runner) {
    console.error(`Unknown scenario "${args.scenario}". Options: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exit(1);
  }
  await runner(args);
}

void main();
