import type { Checker, Limits } from "../protocol";
import type { LanguageSpec } from "../languages/registry";
import type { CompileResult, JudgeBackend, RunOutcome } from "./index";

/**
 * HTTP client for the self-hosted Docker sandbox runner (runner/server.js).
 * One backend instance = one warm container for the whole submission (D6):
 * `session/start` compiles once, `session/run` executes each test case
 * against the same container, `session/end` tears it down.
 *
 * EXACT/TOKEN/FLOAT checking happens in engine.ts against the raw stdout
 * this backend returns — SPECIAL/INTERACTIVE checkers execute *inside* the
 * runner's sandbox (D5), so for those checker types this backend forwards
 * the checker program and returns an already-resolved verdict via
 * `interactiveVerdict`/a mapped status rather than raw stdout.
 */
export class RunnerBackend implements JudgeBackend {
  readonly id = "runner";
  private sessionId: string | null = null;
  private image: string | undefined;

  constructor(private readonly baseUrl: string) {}

  imageRef(): string | undefined {
    return this.image;
  }

  private token(): string {
    return process.env.RUNNER_TOKEN!.trim();
  }

  async compile(opts: { language: LanguageSpec; source: string }): Promise<CompileResult> {
    const res = await fetch(`${this.baseUrl}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Runner-Token": this.token() },
      body: JSON.stringify({ language: opts.language.id, code: opts.source }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`runner returned ${res.status} starting session`);

    const data = (await res.json()) as {
      ok: boolean;
      sessionId?: string;
      image?: string;
      compileOk: boolean;
      compileStderr?: string;
      compileMs: number;
      message?: string;
    };
    if (!data.ok) throw new Error(data.message || "runner rejected the session");

    this.sessionId = data.sessionId ?? null;
    this.image = data.image;
    return { ok: data.compileOk, stderr: data.compileStderr ?? "", ms: data.compileMs };
  }

  async run(opts: { input: string; limits: Limits; checker: Checker }): Promise<RunOutcome> {
    if (!this.sessionId) throw new Error("compile() must succeed before run()");

    const res = await fetch(`${this.baseUrl}/session/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Runner-Token": this.token() },
      body: JSON.stringify({
        sessionId: this.sessionId,
        input: opts.input,
        limits: opts.limits,
        checker: opts.checker.type === "SPECIAL" || opts.checker.type === "INTERACTIVE" ? opts.checker : undefined,
      }),
      signal: AbortSignal.timeout(Math.max(30_000, opts.limits.wallMs + 10_000)),
    });
    if (!res.ok) throw new Error(`runner returned ${res.status} running a test`);

    const data = (await res.json()) as RunOutcome & { ok: boolean; message?: string };
    if (!data.ok) throw new Error(data.message || "runner rejected the run request");
    return data;
  }

  async cleanup(): Promise<void> {
    if (!this.sessionId) return;
    const sessionId = this.sessionId;
    this.sessionId = null;
    await fetch(`${this.baseUrl}/session/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Runner-Token": this.token() },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
}
