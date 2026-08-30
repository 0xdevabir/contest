/**
 * Batch-judging logic shared between the HTTP /judge endpoint (server.js) and
 * the golden conformance suite (tests/golden/), so both exercise identical
 * verdict rules against the real Docker sandbox — one implementation, not two
 * that can drift apart.
 */

export function normalizeOutput(s) {
  return s.replace(/\r\n/g, "\n").replace(/\s+$/g, "").replace(/[ \t]+$/gm, "");
}

/**
 * Runs `tests` against an already-compiled sandbox and scores each one.
 * Stops at the first non-AC test, matching the existing (pre-Phase-3) judge
 * behaviour. A non-zero exit is reported as `MLE` when the container's cgroup
 * shows an OOM kill, `RE` otherwise — see Sandbox#wasOomKilled for the
 * pooled-container caveat.
 */
export async function judgeTests(box, tests, timeLimitMs) {
  const results = [];
  let overall = "AC";

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const input = t.input.endsWith("\n") || t.input === "" ? t.input : `${t.input}\n`;
    const run = await box.runBatch(input, timeLimitMs);

    let verdict = "AC";
    if (run.timedOut) {
      verdict = "TLE";
    } else if (run.code !== 0) {
      verdict = (await box.wasOomKilled()) ? "MLE" : "RE";
    } else if (normalizeOutput(run.stdout) !== normalizeOutput(t.output)) {
      verdict = "WA";
    }

    results.push({
      index: i,
      verdict,
      timeMs: run.ms,
      stdout: run.stdout,
      stderr: run.stderr,
      expected: t.output,
      sample: t.sample,
    });

    if (verdict !== "AC") {
      overall = verdict;
      break;
    }
  }

  return { verdict: overall, results };
}
