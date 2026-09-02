import { spawn } from "child_process";
import { mkdtemp, rm, writeFile, chmod } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { Checker, Limits } from "../protocol";
import type { LanguageSpec } from "../languages/registry";
import type { CompileResult, JudgeBackend, RunOutcome } from "./index";
import { runInteractiveLocal } from "../checkers/interactive";

/**
 * The registry's compile argv targets the Linux sandbox images (`-static`
 * removes the dynamic loader from the hot path in the untrusted container —
 * D1). Neither property applies to this dev-only host process: macOS ships
 * no static libc at all (a `-static` link fails outright), and there's no
 * sandbox here for `-static` to harden. Substitute the platform's real
 * compiler and drop flags the host toolchain can't satisfy.
 */
function localizeCompileArgv(language: LanguageSpec, argv: string[]): string[] {
  const isDarwin = process.platform === "darwin";
  return argv
    .map((tok) => {
      if (!isDarwin) return tok;
      if (tok === "gcc" && language.family === "c") return "clang";
      if (tok === "g++" && language.family === "cpp") return "clang++";
      return tok;
    })
    .filter((tok) => !(isDarwin && tok === "-static"));
}

const SANDBOX_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PATH: "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  HOME: "/tmp",
};

/**
 * The in-process compile-and-run path has none of the sandbox's network
 * isolation, memory caps, or filesystem restrictions — same trust boundary
 * as src/lib/judge.ts's ALLOW_INSECURE_LOCAL_JUDGE path, generalised across
 * the language registry. Only safe for local development.
 *
 * Resource accounting is approximate: without cgroups there is no exact CPU
 * time or memory peak, so cpuMs is wall time and memoryKb is unset — real
 * MLE/CPU-vs-wall TLE distinction needs the runner backend (D2, D3).
 */
export class LocalBackend implements JudgeBackend {
  readonly id = "local";
  private dir: string | null = null;
  private runArgv: string[] | null = null;
  private language: LanguageSpec | null = null;

  imageRef(): string | undefined {
    return undefined;
  }

  async compile(opts: { language: LanguageSpec; source: string }): Promise<CompileResult> {
    this.language = opts.language;
    this.dir = await mkdtemp(path.join(tmpdir(), "ch-judge-"));
    const srcPath = path.join(this.dir, opts.language.sourceFile);
    await writeFile(srcPath, opts.source, "utf8");

    if (!opts.language.compile) {
      this.runArgv = opts.language.run.argv;
      return { ok: true, stderr: "", ms: 0 };
    }

    const started = Date.now();
    const [cmd, ...rawArgs] = localizeCompileArgv(opts.language, opts.language.compile.argv);
    const result = await execCapture(cmd, rawArgs, { cwd: this.dir, timeoutMs: opts.language.compile.timeoutMs });
    const ms = Date.now() - started;

    if (result.spawnFailed) {
      return { ok: false, stderr: `Compiler not available locally: ${cmd}`, ms };
    }
    if (result.timedOut) return { ok: false, stderr: "Compilation timed out.", ms };
    if (result.code !== 0) return { ok: false, stderr: result.stderr || result.stdout || "Compilation failed.", ms };

    if (opts.language.family === "c" || opts.language.family === "cpp" || opts.language.family === "go") {
      await chmod(path.join(this.dir, opts.language.compile.outputFile), 0o755).catch(() => undefined);
    }
    this.runArgv = opts.language.run.argv;
    return { ok: true, stderr: result.stderr, ms };
  }

  async run(opts: { input: string; limits: Limits; checker: Checker }): Promise<RunOutcome> {
    if (!this.dir || !this.runArgv || !this.language) throw new Error("compile() must succeed before run()");

    if (opts.checker.type === "INTERACTIVE") {
      return this.runInteractive(opts);
    }

    const [cmd, ...args] = this.runArgv;
    const outputCap = opts.limits.outputKb * 1024;
    const result = await execCapture(cmd, args, {
      cwd: this.dir,
      input: opts.input,
      timeoutMs: opts.limits.wallMs,
      maxOutputBytes: outputCap,
    });

    if (result.outputExceeded) {
      return { status: "OLE", stdout: result.stdout, stderr: result.stderr, cpuMs: result.wallMs, wallMs: result.wallMs, exitCode: result.code };
    }
    if (result.timedOut) {
      return { status: "TLE", stdout: result.stdout, stderr: result.stderr, cpuMs: result.wallMs, wallMs: result.wallMs, exitCode: null };
    }
    if (result.code !== 0) {
      const oomPattern = this.language.oomStderrPattern;
      if (oomPattern && result.stderr.includes(oomPattern)) {
        return { status: "MLE", stdout: result.stdout, stderr: result.stderr, cpuMs: result.wallMs, wallMs: result.wallMs, exitCode: result.code };
      }
      return { status: "RE", stdout: result.stdout, stderr: result.stderr, cpuMs: result.wallMs, wallMs: result.wallMs, exitCode: result.code };
    }
    return { status: "ok", stdout: result.stdout, stderr: result.stderr, cpuMs: result.wallMs, wallMs: result.wallMs, exitCode: result.code };
  }

  private async runInteractive(opts: { input: string; limits: Limits; checker: Checker }): Promise<RunOutcome> {
    if (!this.dir || !this.runArgv) throw new Error("compile() must succeed before run()");
    if (!opts.checker.programSource || !opts.checker.programLanguage) {
      throw new Error("INTERACTIVE checker requires programSource and programLanguage");
    }
    if (opts.checker.programLanguage.toLowerCase() !== "c") {
      throw new Error("Local interactive backend only supports a C interactor.");
    }

    const interactorSrc = path.join(this.dir, "interactor.c");
    const interactorBin = path.join(this.dir, "interactor");
    await writeFile(interactorSrc, opts.checker.programSource, "utf8");
    const compiler = process.platform === "darwin" ? "clang" : "gcc";
    const compiled = await execCapture(compiler, ["-O2", "-std=c11", "-o", interactorBin, interactorSrc], { cwd: this.dir, timeoutMs: 10_000 });
    if (compiled.code !== 0) {
      return { status: "IE", stdout: "", stderr: "Interactor failed to compile.", cpuMs: 0, wallMs: 0, exitCode: null };
    }
    await chmod(interactorBin, 0o755);

    const [cmd, ...args] = this.runArgv;
    const started = Date.now();
    const result = await runInteractiveLocal({
      interactorBin,
      interactorArgs: [],
      submissionBin: cmd,
      submissionArgs: args,
      timeoutMs: opts.limits.wallMs,
    });
    const wallMs = Date.now() - started;
    const mapped = result.verdict === "RE" ? "RE" : "ok";
    return {
      status: mapped,
      stdout: "",
      stderr: result.message,
      cpuMs: wallMs,
      wallMs,
      exitCode: 0,
      interactiveVerdict: result.verdict,
    };
  }

  async cleanup(): Promise<void> {
    if (this.dir) await rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
    this.dir = null;
  }
}

function execCapture(
  cmd: string,
  args: string[],
  opts: { cwd: string; input?: string; timeoutMs: number; maxOutputBytes?: number }
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnFailed: boolean;
  outputExceeded: boolean;
  wallMs: number;
}> {
  const cap = opts.maxOutputBytes ?? 1_000_000;
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: SANDBOX_ENV, stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnFailed = false;
    let outputExceeded = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (outputExceeded) return;
      stdout += chunk.toString("utf8");
      if (stdout.length > cap) {
        stdout = stdout.slice(0, cap);
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < cap) stderr += chunk.toString("utf8");
    });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, spawnFailed, outputExceeded, wallMs: Date.now() - started });
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
