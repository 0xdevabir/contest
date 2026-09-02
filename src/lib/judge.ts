import { spawn } from "child_process";
import { mkdtemp, rm, writeFile, chmod } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { JudgeVerdict, TestCase, TestResult } from "./types";
import { remoteJudgeUrl, runRemote, verdictFromStatus } from "./remote-judge";
import { log } from "./log";
import { isEnabled } from "./flags";
import { judgeSubmission, type JudgeReport } from "./judge/index";
import { randomUUID } from "crypto";

const MAX_CODE_BYTES = 100_000;
export const MAX_OUTPUT_BYTES = 1_000_000;

/**
 * Untrusted code gets nothing from our environment. PATH is needed to exec
 * the compiler/binary, LANG/LC_ALL keep locale-dependent formatting (e.g.
 * printf of floats) stable across machines, HOME gives libc a writable-looking
 * home dir some toolchains probe for. Nothing secret-shaped is here.
 *
 * Fixes: a submitted program run with `env: process.env` could read every
 * secret the server holds (DATABASE_URL, AUTH_SECRET, SMTP_PASS, ...) via
 * `getenv()` and return it as its own stdout. See docs/ULTIMATE_PLAN.md §3 F-1.
 */
const SANDBOX_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PATH: "/usr/local/bin:/usr/bin:/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  HOME: "/tmp",
};

let warnedInsecureLocalJudge = false;

/**
 * The in-process compile-and-run path has none of the sandbox's network
 * isolation, memory caps, or filesystem restrictions — it is only safe for
 * local development. Production must go through the Docker runner or a
 * remote judge; if neither is configured this returns false and callers
 * refuse to judge instead of silently falling back to the insecure path.
 */
export function localJudgeAllowed(): boolean {
  if (process.env.ALLOW_INSECURE_LOCAL_JUDGE === "1") return true;
  if (process.env.NODE_ENV === "production") {
    if (!warnedInsecureLocalJudge) {
      warnedInsecureLocalJudge = true;
      log.error(
        "Judge misconfigured: no runner/remote judge configured and ALLOW_INSECURE_LOCAL_JUDGE is not set in production. Refusing to compile untrusted code in-process."
      );
    }
    return false;
  }
  return true;
}

function judgeNotConfigured(): {
  verdict: JudgeVerdict;
  compileStderr?: string;
  results: TestResult[];
  message: string;
} {
  return {
    verdict: "IE",
    results: [],
    message: "Judge is not configured.",
  };
}

export function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\s+$/g, "").replace(/[ \t]+$/gm, "");
}

function compilerBin(): string {
  return process.platform === "darwin" ? "clang" : "gcc";
}

function runProcess(
  cmd: string,
  args: string[],
  opts: {
    cwd?: string;
    input?: string;
    timeoutMs: number;
    maxOutputBytes?: number;
  }
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnFailed: boolean;
  wallMs: number;
}> {
  const cap = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: SANDBOX_ENV,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnFailed = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < cap) {
        stdout += chunk.toString("utf8");
        if (stdout.length > cap) {
          stdout = stdout.slice(0, cap);
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < cap) {
        stderr += chunk.toString("utf8");
      }
    });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        stdout,
        stderr,
        timedOut,
        spawnFailed,
        wallMs: Date.now() - started,
      });
    };

    child.on("error", (err) => {
      spawnFailed = true;
      stderr = stderr || String(err.message);
      finish(127);
    });
    child.on("close", (code) => finish(code));

    if (opts.input != null) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

async function compileCode(
  code: string
): Promise<
  | { ok: true; dir: string; bin: string }
  | { ok: false; verdict: JudgeVerdict; compileStderr?: string; message?: string; dir?: string }
> {
  if (!code || code.length > MAX_CODE_BYTES) {
    return {
      ok: false,
      verdict: "ERROR",
      message: "Code missing or too large (max 100KB).",
    };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "diu-contesthub-"));
  const src = path.join(dir, "main.c");
  const bin = path.join(dir, "main");

  try {
    await writeFile(src, code, "utf8");
    const compile = await runProcess(
      compilerBin(),
      ["-O2", "-std=c11", "-Wall", "-Wextra", "-o", bin, src],
      { cwd: dir, timeoutMs: 10_000 }
    );

    if (compile.spawnFailed) {
      return {
        ok: false,
        verdict: "ERROR",
        message: `No C compiler available on the server (${compilerBin()} not found). Set JUDGE0_URL to use a remote judge.`,
        dir,
      };
    }
    if (compile.timedOut) {
      return { ok: false, verdict: "CE", compileStderr: "Compilation timed out.", dir };
    }
    if (compile.code !== 0) {
      return {
        ok: false,
        verdict: "CE",
        compileStderr: compile.stderr || compile.stdout || "Compilation failed.",
        dir,
      };
    }

    await chmod(bin, 0o755);
    return { ok: true, dir, bin };
  } catch (err) {
    return {
      ok: false,
      verdict: "ERROR",
      message: err instanceof Error ? err.message : "Compile setup failed",
      dir,
    };
  }
}

async function cleanup(dir?: string) {
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** The self-hosted runner is preferred over Judge0 when it is configured. */
function runnerJudgeUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_RUNNER_URL?.trim();
  const token = process.env.RUNNER_TOKEN?.trim();
  if (!url || !token) return null;
  return url.replace(/^ws/, "http").replace(/\/+$/, "");
}

async function judgeViaRunner(
  base: string,
  opts: { code: string; tests: TestCase[]; timeLimitMs: number }
): Promise<{
  verdict: JudgeVerdict;
  compileStderr?: string;
  results: TestResult[];
  message?: string;
}> {
  const res = await fetch(`${base}/judge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Runner-Token": process.env.RUNNER_TOKEN!.trim(),
    },
    body: JSON.stringify({
      code: opts.code,
      tests: opts.tests,
      timeLimitMs: opts.timeLimitMs,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`runner returned ${res.status}`);

  const data = (await res.json()) as {
    ok: boolean;
    verdict: JudgeVerdict;
    compileStderr?: string;
    results?: TestResult[];
    message?: string;
  };
  if (!data.ok) throw new Error(data.message || "runner rejected the request");

  return {
    verdict: data.verdict,
    compileStderr: data.compileStderr,
    results: data.results ?? [],
    message: data.message,
  };
}

async function judgeRemote(opts: {
  code: string;
  tests: TestCase[];
  timeLimitMs: number;
}): Promise<{
  verdict: JudgeVerdict;
  compileStderr?: string;
  results: TestResult[];
  message?: string;
}> {
  const results: TestResult[] = [];
  let overall: JudgeVerdict = "AC";

  for (let i = 0; i < opts.tests.length; i++) {
    const t = opts.tests[i];
    const input = t.input.endsWith("\n") || t.input === "" ? t.input : `${t.input}\n`;

    let run;
    try {
      run = await runRemote({ code: opts.code, stdin: input, timeLimitMs: opts.timeLimitMs });
    } catch (err) {
      return {
        verdict: "ERROR",
        results,
        message: err instanceof Error ? err.message : "Judge service unavailable",
      };
    }

    let verdict = verdictFromStatus(run.statusId);
    if (verdict === "CE") {
      return { verdict: "CE", compileStderr: run.compileOutput || "Compilation failed.", results: [] };
    }
    if (verdict === "AC" && normalizeOutput(run.stdout) !== normalizeOutput(t.output)) {
      verdict = "WA";
    }

    results.push({
      index: i,
      verdict,
      timeMs: run.timeMs,
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

/**
 * Adapts a Phase 3 JudgeReport (grouped, multi-language, resource-aware)
 * back into the flat single-language shape every existing caller expects.
 * The flat `tests` this shim submits are always a single group (order 0,
 * TOKEN checker, C), so `report.tests` is already in test order — no
 * grouping/dependsOn/PA behaviour to reconcile here.
 */
function adaptEngineReport(
  report: JudgeReport,
  tests: TestCase[]
): { verdict: JudgeVerdict; compileStderr?: string; results: TestResult[]; message?: string; score?: number; maxScore?: number } {
  if (!report.compile.ok) {
    return { verdict: "CE", compileStderr: report.compile.stderr, results: [] };
  }
  const results: TestResult[] = report.tests.map((t) => ({
    index: t.index,
    verdict: t.verdict as JudgeVerdict,
    timeMs: t.wallMs,
    stdout: t.stdout ?? "",
    stderr: t.stderr ?? "",
    expected: tests[t.index]?.output,
    sample: tests[t.index]?.sample,
    cpuMs: t.cpuMs,
    memoryKb: t.memoryKb,
  }));
  return { verdict: report.verdict as JudgeVerdict, results, message: report.message, score: report.score, maxScore: report.maxScore };
}

/**
 * D-rollout — `judgeV2` gates the Phase 3 engine for the legacy flat/C-only
 * call sites (compileAndJudge/runCustom). Off (the default until the flag is
 * enabled): every call below behaves exactly as before Phase 3 shipped, so
 * flipping the flag off is a real rollback, not just a code-path that
 * happens to look unused. On: the flat `tests` become a single default
 * group and run through the new engine (real MLE/OLE, per-test resource
 * metrics), still C-only until callers pass grouped, multi-language data
 * through judgeSubmission() directly.
 */
async function judgeV2Enabled(): Promise<boolean> {
  return isEnabled("judgeV2");
}

export async function compileAndJudge(opts: {
  code: string;
  tests: TestCase[];
  timeLimitMs: number;
  memoryLimitMb?: number;
  /** Halved for anonymous requests — see docs/ULTIMATE_PLAN.md §3 F-2. */
  maxOutputBytes?: number;
}): Promise<{
  verdict: JudgeVerdict;
  compileStderr?: string;
  results: TestResult[];
  message?: string;
  score?: number;
  maxScore?: number;
}> {
  if (!opts.tests.length) {
    return {
      verdict: "SKIP",
      results: [],
      message: "No automatic tests for this problem.",
    };
  }

  if (await judgeV2Enabled()) {
    const report = await judgeSubmission({
      submissionId: randomUUID(),
      language: "c",
      source: opts.code,
      timeLimitMs: opts.timeLimitMs,
      memoryLimitMb: opts.memoryLimitMb ?? 256,
      outputLimitKb: opts.maxOutputBytes ? Math.ceil(opts.maxOutputBytes / 1024) : undefined,
      checker: { type: "TOKEN" },
      groups: [
        {
          group: 0,
          points: 100,
          stopOnFail: true,
          cases: opts.tests.map((t, i) => ({ index: i, input: t.input, expected: t.output, sample: t.sample })),
        },
      ],
    });
    return adaptEngineReport(report, opts.tests);
  }

  const runner = runnerJudgeUrl();
  if (runner) {
    try {
      return await judgeViaRunner(runner, opts);
    } catch (err) {
      log.error("runner judge failed, falling back", {}, err);
    }
  }

  if (remoteJudgeUrl()) return judgeRemote(opts);

  if (!localJudgeAllowed()) return judgeNotConfigured();

  const compiled = await compileCode(opts.code);
  if (!compiled.ok) {
    await cleanup(compiled.dir);
    return {
      verdict: compiled.verdict,
      compileStderr: compiled.compileStderr,
      results: [],
      message: compiled.message,
    };
  }

  try {
    const results: TestResult[] = [];
    let overall: JudgeVerdict = "AC";

    for (let i = 0; i < opts.tests.length; i++) {
      const t = opts.tests[i];
      const input = t.input.endsWith("\n") || t.input === "" ? t.input : `${t.input}\n`;
      const run = await runProcess(compiled.bin, [], {
        cwd: compiled.dir,
        input,
        timeoutMs: opts.timeLimitMs,
        maxOutputBytes: opts.maxOutputBytes,
      });

      let verdict: JudgeVerdict = "AC";
      if (run.timedOut) verdict = "TLE";
      else if (run.code !== 0) verdict = "RE";
      else if (normalizeOutput(run.stdout) !== normalizeOutput(t.output)) verdict = "WA";

      results.push({
        index: i,
        verdict,
        timeMs: run.wallMs,
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
  } finally {
    await cleanup(compiled.dir);
  }
}

export async function runCustom(opts: {
  code: string;
  stdin: string;
  timeLimitMs: number;
  memoryLimitMb?: number;
  /** Halved for anonymous requests — see docs/ULTIMATE_PLAN.md §3 F-2. */
  maxOutputBytes?: number;
}): Promise<{
  verdict: JudgeVerdict;
  compileStderr?: string;
  stdout: string;
  stderr: string;
  timeMs: number;
  message?: string;
}> {
  const input =
    opts.stdin.endsWith("\n") || opts.stdin === "" ? opts.stdin : `${opts.stdin}\n`;

  if (await judgeV2Enabled()) {
    const report = await judgeSubmission({
      submissionId: randomUUID(),
      language: "c",
      source: opts.code,
      timeLimitMs: opts.timeLimitMs,
      memoryLimitMb: opts.memoryLimitMb ?? 256,
      outputLimitKb: opts.maxOutputBytes ? Math.ceil(opts.maxOutputBytes / 1024) : undefined,
      // "Run" is ungraded — there's no expected output, so WA/AC from the
      // checker is meaningless here. Only a runtime fault (TLE/MLE/OLE/RE)
      // is worth distinguishing; anything else collapses to AC below.
      checker: { type: "EXACT" },
      groups: [{ group: 0, points: 0, stopOnFail: false, cases: [{ index: 0, input, expected: "", sample: true }] }],
    });

    if (!report.compile.ok) {
      return { verdict: "CE", compileStderr: report.compile.stderr, stdout: "", stderr: "", timeMs: 0 };
    }
    const t = report.tests[0];
    const FAULT_VERDICTS: JudgeVerdict[] = ["TLE", "MLE", "OLE", "RE", "IE"];
    const verdict = FAULT_VERDICTS.includes(t.verdict as JudgeVerdict) ? (t.verdict as JudgeVerdict) : "AC";
    return { verdict, stdout: t.stdout ?? "", stderr: t.stderr ?? "", timeMs: t.wallMs, message: report.message };
  }

  if (remoteJudgeUrl()) {
    try {
      const run = await runRemote({
        code: opts.code,
        stdin: input,
        timeLimitMs: opts.timeLimitMs,
      });
      const verdict = verdictFromStatus(run.statusId);
      return {
        verdict,
        compileStderr: verdict === "CE" ? run.compileOutput || "Compilation failed." : undefined,
        stdout: run.stdout,
        stderr: run.stderr,
        timeMs: run.timeMs,
      };
    } catch (err) {
      return {
        verdict: "ERROR",
        stdout: "",
        stderr: "",
        timeMs: 0,
        message: err instanceof Error ? err.message : "Judge service unavailable",
      };
    }
  }

  if (!localJudgeAllowed()) {
    const notConfigured = judgeNotConfigured();
    return {
      verdict: notConfigured.verdict,
      stdout: "",
      stderr: "",
      timeMs: 0,
      message: notConfigured.message,
    };
  }

  const compiled = await compileCode(opts.code);
  if (!compiled.ok) {
    await cleanup(compiled.dir);
    return {
      verdict: compiled.verdict,
      compileStderr: compiled.compileStderr,
      stdout: "",
      stderr: "",
      timeMs: 0,
      message: compiled.message,
    };
  }

  try {
    const run = await runProcess(compiled.bin, [], {
      cwd: compiled.dir,
      input,
      timeoutMs: opts.timeLimitMs,
      maxOutputBytes: opts.maxOutputBytes,
    });

    if (run.timedOut) {
      return { verdict: "TLE", stdout: run.stdout, stderr: run.stderr, timeMs: run.wallMs };
    }
    if (run.code !== 0) {
      return { verdict: "RE", stdout: run.stdout, stderr: run.stderr, timeMs: run.wallMs };
    }
    return { verdict: "AC", stdout: run.stdout, stderr: run.stderr, timeMs: run.wallMs };
  } finally {
    await cleanup(compiled.dir);
  }
}

