import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLanguage } from "./languages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEMORY_OVERRIDE = process.env.SANDBOX_MEMORY; // legacy single-language override, mostly for tests
const CPUS = process.env.SANDBOX_CPUS || "1";
const SESSION_TTL_SEC = Number(process.env.SANDBOX_TTL_SEC || 900);
const MAX_OUTPUT_BYTES = 512_000;
const UID = 10001;
const SECCOMP_PROFILE = path.join(__dirname, "seccomp-profile.json");

/**
 * Every constraint here assumes the code is hostile. The container gets no
 * network, no capabilities, a read-only root, and hard memory/pid caps, so
 * the worst a submission can do is waste its own slice of CPU until it is
 * killed. Phase 3 additions on top of the Phase 0 baseline: per-language
 * images, a custom seccomp profile (D-hardening), and lower PID caps for
 * non-JVM languages.
 */
function createArgs(name, language, memoryMb) {
  const memory = MEMORY_OVERRIDE || `${memoryMb}m`;
  const pidsLimit = language.family === "java" ? "128" : "64";
  const args = [
    "create",
    "--name", name,
    "--interactive",
    "--network", "none",
    "--memory", memory,
    "--memory-swap", memory,
    "--cpus", CPUS,
    "--pids-limit", pidsLimit,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--read-only",
    // exec is required: the compiled binary lives here. uid must match the
    // image user or the compiler cannot write its output.
    "--tmpfs", `/work:rw,exec,size=64m,uid=${UID},gid=${UID}`,
    "--tmpfs", `/tmp:rw,exec,size=64m,uid=${UID},gid=${UID}`,
  ];
  // Roll out log-only before enforcing (D-hardening risk: "seccomp profile
  // breaks a legitimate program") — SANDBOX_SECCOMP=off disables entirely,
  // the profile file's own mode (ERRNO vs LOG) controls enforce-vs-observe.
  if (process.env.SANDBOX_SECCOMP !== "off" && existsSync(SECCOMP_PROFILE)) {
    args.push("--security-opt", `seccomp=${SECCOMP_PROFILE}`);
  }
  args.push(language.image, "sleep", String(SESSION_TTL_SEC));
  return args;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputExceeded = false;
    const cap = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
    const started = Date.now();

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (b) => {
      if (outputExceeded) return;
      stdout += b.toString("utf8");
      if (stdout.length > cap) {
        stdout = stdout.slice(0, cap);
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (b) => {
      if (stderr.length < cap) stderr += b.toString("utf8");
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: String(err.message), timedOut, outputExceeded, ms: Date.now() - started });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, outputExceeded, ms: Date.now() - started });
    });

    if (opts.input != null) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

/** Students should see the plain source filename, not the sandbox's internal paths. */
function tidy(output, sourceFile) {
  return output.replaceAll(`/work/${sourceFile}`, sourceFile).replaceAll("/work/main", "main");
}

export class Sandbox {
  constructor(languageId = "c") {
    this.language = getLanguage(languageId);
    this.name = `ch-${randomUUID().slice(0, 12)}`;
    this.started = false;
    this.destroyed = false;
    this.current = null;
    this.runCount = 0;
  }

  async start(memoryMb = 256) {
    const created = await run("docker", createArgs(this.name, this.language, memoryMb), { timeoutMs: 30_000 });
    if (created.code !== 0) {
      throw new Error(`sandbox create failed: ${created.stderr.trim() || created.stdout.trim()}`);
    }
    const startRes = await run("docker", ["start", this.name], { timeoutMs: 30_000 });
    if (startRes.code !== 0) {
      throw new Error(`sandbox start failed: ${startRes.stderr.trim()}`);
    }
    this.started = true;
  }

  /** Compiles the staged source (or, for interpreted languages, does nothing). */
  async compile(code) {
    if (!this.started) throw new Error("sandbox not started");
    const { sourceFile, compile } = this.language;

    // `docker cp` refuses to write into a container with a read-only rootfs
    // even when the destination is a writable tmpfs, so the source is
    // streamed in on stdin instead. Going through stdin also keeps the code
    // out of argv.
    const staged = await run(
      "docker",
      ["exec", "--interactive", this.name, "sh", "-c", `cat > /work/${sourceFile}`],
      { input: code, timeoutMs: 15_000 }
    );
    if (staged.code !== 0) {
      return { ok: false, output: staged.stderr.trim() || "Could not stage source file." };
    }

    if (!compile) return { ok: true, output: "", compileMs: 0 };

    const started = Date.now();
    const res = await run("docker", ["exec", this.name, ...compile.argv], { timeoutMs: compile.timeoutMs });
    const compileMs = Date.now() - started;

    if (res.timedOut) return { ok: false, output: "Compilation timed out.", compileMs };
    if (res.code !== 0) {
      return { ok: false, output: tidy(res.stderr || res.stdout || "Compilation failed.", sourceFile), compileMs };
    }
    // Warnings on a successful build are still worth showing.
    return { ok: true, output: tidy(res.stderr, sourceFile), compileMs };
  }

  /**
   * Interactive run. `script` allocates a pty inside the container so the
   * runtime line-buffers instead of block-buffering; without it a prompt
   * would not appear until the program exited.
   */
  startInteractive({ onData, onExit, timeLimitMs }) {
    const child = spawn(
      "docker",
      ["exec", "--interactive", this.name, "script", "-qfec", this.language.run.argv.join(" "), "/dev/null"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const started = Date.now();
    let bytes = 0;
    let finished = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      this.killProgram();
    }, timeLimitMs);

    const emit = (buf) => {
      if (finished) return;
      const text = buf.toString("utf8");
      bytes += text.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          onData("\r\n[output limit exceeded — program stopped]\r\n");
          child.kill("SIGKILL");
          this.killProgram();
          onExit({ code: null, timedOut: false, truncated: true, ms: Date.now() - started });
        }
        return;
      }
      onData(text);
    };

    child.stdout.on("data", emit);
    child.stderr.on("data", emit);

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      onExit({ code, timedOut, truncated: false, ms: Date.now() - started });
    });

    this.current = child;
    return {
      write: (data) => {
        if (!child.killed && child.stdin.writable) child.stdin.write(data);
      },
      kill: () => {
        child.kill("SIGKILL");
        this.killProgram();
      },
    };
  }

  /**
   * Batch run of one test case via runsvc (D2/D3/D4): resource accounting is
   * exact per-run (cgroup memory.peak reset before each run where the
   * kernel supports it, wait4() rusage for CPU time), unlike the pooled
   * container's whole-lifetime `docker inspect OOMKilled` this replaces.
   *
   * `limits.cpuMs`/`limits.wallMs` are already scaled per-language
   * (D2/D3 — see src/lib/judge/languages/registry.ts's scaledLimits) by the
   * caller; this method just enforces them.
   */
  async runBatch(input, limitsOrMs) {
    if (!this.started) throw new Error("sandbox not started");
    this.runCount++;

    // Legacy callers (test-runner.js, the pre-Phase-3 `/judge` path) pass a
    // single millisecond budget; treat it as both the CPU and wall limit.
    const limits =
      typeof limitsOrMs === "number"
        ? { cpuMs: limitsOrMs, wallMs: limitsOrMs, outputKb: 500 }
        : limitsOrMs;

    // Best-effort: writing 0 to memory.peak resets the high-water mark on
    // kernels that support it (5.19+). On older kernels this silently
    // no-ops and memory.peak stays a whole-container-lifetime max — still
    // useful (never *under*-reports a real MLE), just not exact for a
    // second test case run in the same warm container.
    await run("docker", ["exec", this.name, "sh", "-c", "echo 0 > /sys/fs/cgroup/memory.peak 2>/dev/null || true"], {
      timeoutMs: 5_000,
    });
    const oomBefore = await this.oomKillCount();

    const cpuSec = Math.max(1, Math.ceil(limits.cpuMs / 1000));
    const fsizeBytes = Math.max(1_048_576, limits.outputKb * 1024 * 2);
    const rusageFile = `/tmp/rusage-${this.runCount}.json`;

    const res = await run(
      "docker",
      ["exec", "--interactive", this.name, "runsvc", String(cpuSec), String(fsizeBytes), "64", rusageFile, "--", ...this.language.run.argv],
      { input, timeoutMs: limits.wallMs, maxOutputBytes: limits.outputKb * 1024 }
    );

    const rusage = await this.readRusage(rusageFile);
    const memoryPeakKb = await this.memoryPeakKb();
    const oomAfter = await this.oomKillCount();

    return {
      code: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      timedOut: res.timedOut,
      outputExceeded: res.outputExceeded,
      ms: res.ms, // legacy alias for wallMs — test-runner.js reads this
      wallMs: res.ms,
      cpuMs: rusage?.cpuMs ?? res.ms,
      cpuLimited: rusage?.cpuLimited ?? false,
      memoryPeakKb,
      oomKilled: oomAfter > oomBefore,
    };
  }

  async readRusage(rusageFile) {
    const res = await run("docker", ["exec", this.name, "cat", rusageFile], { timeoutMs: 5_000 });
    if (res.code !== 0 || !res.stdout.trim()) return null;
    try {
      return JSON.parse(res.stdout.trim());
    } catch {
      return null;
    }
  }

  /** cgroup v2 memory.peak, in KB (the file reports bytes). */
  async memoryPeakKb() {
    const res = await run("docker", ["exec", this.name, "cat", "/sys/fs/cgroup/memory.peak"], { timeoutMs: 5_000 });
    if (res.code !== 0) return undefined;
    const bytes = Number(res.stdout.trim());
    return Number.isFinite(bytes) ? Math.round(bytes / 1024) : undefined;
  }

  /** cgroup v2 memory.events' oom_kill counter — exact, unlike `docker inspect .State.OOMKilled`. */
  async oomKillCount() {
    const res = await run("docker", ["exec", this.name, "cat", "/sys/fs/cgroup/memory.events"], { timeoutMs: 5_000 });
    if (res.code !== 0) return 0;
    const match = res.stdout.match(/oom_kill (\d+)/);
    return match ? Number(match[1]) : 0;
  }

  /** SIGKILL anything still executing without tearing down the container. */
  async killProgram() {
    await run("docker", ["exec", this.name, "pkill", "-9", "-f", "runsvc"], { timeoutMs: 5_000 }).catch(() => {});
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.current && !this.current.killed) this.current.kill("SIGKILL");
    await run("docker", ["rm", "-f", this.name], { timeoutMs: 20_000 }).catch(() => {});
  }
}

/** Remove any containers orphaned by a crash or restart. */
export async function reapOrphans() {
  const res = await run("docker", ["ps", "-aq", "--filter", "name=^ch-", "--filter", "status=exited"]);
  const ids = res.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  if (ids.length) await run("docker", ["rm", "-f", ...ids], { timeoutMs: 30_000 });
  return ids.length;
}

export async function imageExists(languageId = "c") {
  const lang = getLanguage(languageId);
  const res = await run("docker", ["image", "inspect", lang.image]);
  return res.code === 0;
}
