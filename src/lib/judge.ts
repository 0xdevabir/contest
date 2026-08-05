import { spawn } from "child_process";
import { mkdtemp, rm, writeFile, chmod } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { JudgeVerdict, TestCase, TestResult } from "./types";
import { remoteJudgeUrl, runRemote, verdictFromStatus } from "./remote-judge";

const MAX_CODE_BYTES = 100_000;
const MAX_OUTPUT_BYTES = 1_000_000;

function normalizeOutput(s: string): string {
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
  }
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnFailed: boolean;
  wallMs: number;
}> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: process.env,
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
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += chunk.toString("utf8");
        if (stdout.length > MAX_OUTPUT_BYTES) {
          stdout = stdout.slice(0, MAX_OUTPUT_BYTES);
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
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

export async function compileAndJudge(opts: {
  code: string;
  tests: TestCase[];
  timeLimitMs: number;
}): Promise<{
  verdict: JudgeVerdict;
  compileStderr?: string;
  results: TestResult[];
  message?: string;
}> {
  if (!opts.tests.length) {
    return {
      verdict: "SKIP",
      results: [],
      message: "No automatic tests for this problem.",
    };
  }

  const runner = runnerJudgeUrl();
  if (runner) {
    try {
      return await judgeViaRunner(runner, opts);
    } catch (err) {
      console.error("runner judge failed, falling back", err);
    }
  }

  if (remoteJudgeUrl()) return judgeRemote(opts);

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

