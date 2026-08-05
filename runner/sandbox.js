import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const IMAGE = process.env.SANDBOX_IMAGE || "contest-hub-sandbox";
const MEMORY = process.env.SANDBOX_MEMORY || "256m";
const CPUS = process.env.SANDBOX_CPUS || "1";
const SESSION_TTL_SEC = Number(process.env.SANDBOX_TTL_SEC || 900);
const COMPILE_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 512_000;
const UID = 10001;

/**
 * Every constraint here assumes the code is hostile. The container gets no
 * network, no capabilities, a read-only root, and hard memory/pid caps, so the
 * worst a submission can do is waste its own slice of CPU until it is killed.
 */
function createArgs(name) {
  return [
    "create",
    "--name", name,
    "--interactive",
    "--network", "none",
    "--memory", MEMORY,
    "--memory-swap", MEMORY,
    "--cpus", CPUS,
    "--pids-limit", "128",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--read-only",
    // exec is required: the compiled binary lives here. uid must match the
    // image user or gcc cannot write its output.
    "--tmpfs", `/work:rw,exec,size=32m,uid=${UID},gid=${UID}`,
    "--tmpfs", `/tmp:rw,exec,size=64m,uid=${UID},gid=${UID}`,
    IMAGE,
    "sleep", String(SESSION_TTL_SEC),
  ];
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const started = Date.now();

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (b) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += b.toString("utf8");
    });
    child.stderr.on("data", (b) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += b.toString("utf8");
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: String(err.message), timedOut, ms: Date.now() - started });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, ms: Date.now() - started });
    });

    if (opts.input != null) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

/** Students should see `main.c`, not the sandbox's internal paths. */
function tidy(output) {
  return output.replaceAll("/work/main.c", "main.c").replaceAll("/work/main", "main");
}

export class Sandbox {
  constructor() {
    this.name = `ch-${randomUUID().slice(0, 12)}`;
    this.started = false;
    this.destroyed = false;
    this.current = null;
  }

  async start() {
    const created = await run("docker", createArgs(this.name), { timeoutMs: 30_000 });
    if (created.code !== 0) {
      throw new Error(`sandbox create failed: ${created.stderr.trim() || created.stdout.trim()}`);
    }
    const startRes = await run("docker", ["start", this.name], { timeoutMs: 30_000 });
    if (startRes.code !== 0) {
      throw new Error(`sandbox start failed: ${startRes.stderr.trim()}`);
    }
    this.started = true;
  }

  async compile(code) {
    if (!this.started) throw new Error("sandbox not started");

    // `docker cp` refuses to write into a container with a read-only rootfs even
    // when the destination is a writable tmpfs, so the source is streamed in on
    // stdin instead. Going through stdin also keeps the code out of argv.
    const staged = await run(
      "docker",
      ["exec", "--interactive", this.name, "sh", "-c", "cat > /work/main.c"],
      { input: code, timeoutMs: 15_000 }
    );
    if (staged.code !== 0) {
      return { ok: false, output: staged.stderr.trim() || "Could not stage source file." };
    }

    const res = await run(
      "docker",
      [
        "exec", this.name,
        "gcc", "-O2", "-std=c11", "-Wall", "-Wextra",
        "-o", "/work/main", "/work/main.c",
      ],
      { timeoutMs: COMPILE_TIMEOUT_MS }
    );

    if (res.timedOut) return { ok: false, output: "Compilation timed out." };
    if (res.code !== 0) {
      return { ok: false, output: tidy(res.stderr || res.stdout || "Compilation failed.") };
    }
    // -Wall/-Wextra diagnostics on a successful build are still worth showing.
    return { ok: true, output: tidy(res.stderr) };
  }

  /**
   * Interactive run. `script` allocates a pty inside the container so the C
   * runtime line-buffers instead of block-buffering; without it a prompt like
   * printf("Enter n: ") would not appear until the program exited.
   */
  startInteractive({ onData, onExit, timeLimitMs }) {
    const child = spawn(
      "docker",
      ["exec", "--interactive", this.name, "script", "-qfec", "/work/main", "/dev/null"],
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

  /** Batch run used for judging against a fixed test case. */
  async runBatch(input, timeLimitMs) {
    const res = await run(
      "docker",
      ["exec", "--interactive", this.name, "/work/main"],
      { input, timeoutMs: timeLimitMs }
    );
    return res;
  }

  /** SIGKILL anything still executing without tearing down the container. */
  async killProgram() {
    await run("docker", ["exec", this.name, "pkill", "-9", "-f", "/work/main"], {
      timeoutMs: 5_000,
    }).catch(() => {});
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
  const res = await run("docker", [
    "ps", "-aq", "--filter", "name=^ch-", "--filter", "status=exited",
  ]);
  const ids = res.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  if (ids.length) await run("docker", ["rm", "-f", ...ids], { timeoutMs: 30_000 });
  return ids.length;
}

export async function imageExists() {
  const res = await run("docker", ["image", "inspect", IMAGE]);
  return res.code === 0;
}
