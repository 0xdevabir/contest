/**
 * Batch-judging logic shared between the HTTP endpoints (server.js) and the
 * golden conformance suite (tests/golden/), so both exercise identical
 * verdict rules against the real Docker sandbox — one implementation, not
 * two that can drift apart.
 */

export function normalizeOutput(s) {
  return s.replace(/\r\n/g, "\n").replace(/\s+$/g, "").replace(/[ \t]+$/gm, "");
}

/**
 * D2/D3/D4 — classifies one Sandbox#runBatch() result into a runtime-fault
 * status (or "ok", meaning the caller should now apply a checker). Order
 * matters: OLE and TLE are checked before MLE because a program that both
 * spins forever *and* leaks memory should report the fault that actually
 * stopped it, and a wall-clock TLE takes priority over a CPU-limit TLE
 * classification when both could apply (the host's timer fired first).
 */
export function classifyRun(raw, limits, language) {
  if (raw.outputExceeded) {
    return { status: "OLE", cpuMs: raw.cpuMs, wallMs: raw.wallMs, memoryKb: raw.memoryPeakKb, exitCode: raw.code };
  }
  if (raw.timedOut) {
    return {
      status: "TLE",
      reason: raw.cpuLimited ? undefined : "wall",
      cpuMs: raw.cpuMs,
      wallMs: raw.wallMs,
      memoryKb: raw.memoryPeakKb,
      exitCode: raw.code,
    };
  }
  if (raw.cpuLimited) {
    return { status: "TLE", cpuMs: raw.cpuMs, wallMs: raw.wallMs, memoryKb: raw.memoryPeakKb, exitCode: raw.code };
  }

  const memLimitKb = limits.memoryMb * 1024;
  const oomByPeak = raw.memoryPeakKb != null && raw.memoryPeakKb >= memLimitKb;
  if (raw.oomKilled || oomByPeak) {
    return { status: "MLE", cpuMs: raw.cpuMs, wallMs: raw.wallMs, memoryKb: raw.memoryPeakKb, exitCode: raw.code };
  }

  if (raw.code !== 0) {
    // D3 — the JVM throws OutOfMemoryError and exits non-zero *without* an
    // OOM kill when it can't allocate; detect it from stderr per-family.
    if (language?.oomStderrPattern && raw.stderr.includes(language.oomStderrPattern)) {
      return { status: "MLE", cpuMs: raw.cpuMs, wallMs: raw.wallMs, memoryKb: raw.memoryPeakKb, exitCode: raw.code };
    }
    return { status: "RE", cpuMs: raw.cpuMs, wallMs: raw.wallMs, memoryKb: raw.memoryPeakKb, exitCode: raw.code };
  }

  return { status: "ok", cpuMs: raw.cpuMs, wallMs: raw.wallMs, memoryKb: raw.memoryPeakKb, exitCode: raw.code };
}

/**
 * Runs one test case and returns a status ("ok" | TLE | MLE | OLE | RE) plus
 * resource metrics and raw stdout/stderr — no output comparison. This is
 * what the multi-language `/session/run` endpoint (server.js) returns to
 * src/lib/judge/backends/runner.ts, which applies the checker itself
 * (src/lib/judge/checkers) since EXACT/TOKEN/FLOAT are trusted framework
 * code that doesn't need to run inside the sandbox (D5).
 */
export async function runOneCase(box, input, limits) {
  const raw = await box.runBatch(input, limits);
  const classified = classifyRun(raw, limits, box.language);
  return { ...classified, stdout: raw.stdout, stderr: raw.stderr };
}

/**
 * Legacy batch path (pre-Phase-3 shape): runs `tests` against an
 * already-compiled sandbox, comparing output itself (TOKEN-equivalent
 * normalisation) and stopping at the first non-AC test. Kept for the
 * `/judge` endpoint's existing (C-only, ungrouped) callers and the golden
 * suite. `limits` may be a plain number (legacy: one wall-equals-cpu
 * millisecond budget) or a full `{cpuMs, wallMs, memoryMb, outputKb}` object.
 */
export async function judgeTests(box, tests, limits) {
  const resolvedLimits =
    typeof limits === "number"
      ? { cpuMs: limits, wallMs: limits, memoryMb: 256, outputKb: 500 }
      : limits;

  const results = [];
  let overall = "AC";

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const input = t.input.endsWith("\n") || t.input === "" ? t.input : `${t.input}\n`;
    const outcome = await runOneCase(box, input, resolvedLimits);

    let verdict = outcome.status;
    if (verdict === "ok") {
      verdict = normalizeOutput(outcome.stdout) === normalizeOutput(t.output) ? "AC" : "WA";
    }

    results.push({
      index: i,
      verdict,
      timeMs: outcome.wallMs,
      cpuMs: outcome.cpuMs,
      memoryKb: outcome.memoryKb,
      reason: outcome.reason,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
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
