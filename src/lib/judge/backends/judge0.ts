import type { Checker, Limits } from "../protocol";
import type { LanguageSpec } from "../languages/registry";
import type { CompileResult, JudgeBackend, RunOutcome } from "./index";
import { runRemote, verdictFromStatus } from "../../remote-judge";

/**
 * Judge0 remote fallback (existing src/lib/remote-judge.ts, wrapped behind
 * the JudgeBackend interface). Serverless hosts have no local toolchain for
 * any language, and Judge0's free tier only reliably covers C, so this
 * backend is a fallback for C only — multi-language submissions on a
 * serverless deploy need the runner backend configured.
 */
export class Judge0Backend implements JudgeBackend {
  readonly id = "judge0";
  private source = "";

  imageRef(): string | undefined {
    return "judge0:remote";
  }

  async compile(opts: { language: LanguageSpec; source: string }): Promise<CompileResult> {
    if (opts.language.id !== "c") {
      return { ok: false, stderr: `Judge0 backend only supports "c" (got "${opts.language.id}").`, ms: 0 };
    }
    this.source = opts.source;

    const started = Date.now();
    const probe = await runRemote({ code: opts.source, stdin: "", timeLimitMs: 2000 });
    const ms = Date.now() - started;
    if (verdictFromStatus(probe.statusId) === "CE") {
      return { ok: false, stderr: probe.compileOutput || "Compilation failed.", ms };
    }
    return { ok: true, stderr: "", ms };
  }

  async run(opts: { input: string; limits: Limits; checker: Checker }): Promise<RunOutcome> {
    if (opts.checker.type === "INTERACTIVE" || opts.checker.type === "SPECIAL") {
      throw new Error("Judge0 backend does not support SPECIAL/INTERACTIVE checkers.");
    }
    const run = await runRemote({ code: this.source, stdin: opts.input, timeLimitMs: opts.limits.cpuMs });
    const verdict = verdictFromStatus(run.statusId);

    if (verdict === "TLE") {
      return { status: "TLE", stdout: run.stdout, stderr: run.stderr, cpuMs: run.timeMs, wallMs: run.timeMs, exitCode: null };
    }
    if (verdict === "RE") {
      return { status: "RE", stdout: run.stdout, stderr: run.stderr, cpuMs: run.timeMs, wallMs: run.timeMs, exitCode: 1 };
    }
    if (verdict !== "AC") {
      return { status: "IE", stdout: run.stdout, stderr: run.stderr, cpuMs: run.timeMs, wallMs: run.timeMs, exitCode: null };
    }
    return { status: "ok", stdout: run.stdout, stderr: run.stderr, cpuMs: run.timeMs, wallMs: run.timeMs, exitCode: 0 };
  }

  async cleanup(): Promise<void> {
    this.source = "";
  }
}
