import { spawn } from "child_process";
import { mkdtemp, rm, writeFile, chmod } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { JudgeVerdict, TestCase, TestResult } from "./types";

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
        wallMs: Date.now() - started,
      });
    };

    child.on("error", (err) => {
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

  const dir = await mkdtemp(path.join(tmpdir(), "contest-hub-"));
  const src = path.join(dir, "main.c");
  const bin = path.join(dir, "main");

  try {
    await writeFile(src, code, "utf8");
    const compile = await runProcess(
      compilerBin(),
      ["-O2", "-std=c11", "-Wall", "-Wextra", "-o", bin, src],
      { cwd: dir, timeoutMs: 10_000 }
    );

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
    const input =
      opts.stdin.endsWith("\n") || opts.stdin === "" ? opts.stdin : `${opts.stdin}\n`;
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
