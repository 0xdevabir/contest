import type { Checker, Limits } from "../protocol";
import type { LanguageSpec } from "../languages/registry";
import { RunnerBackend } from "./runner";
import { Judge0Backend } from "./judge0";
import { LocalBackend } from "./local";

export type CompileResult = { ok: boolean; stderr: string; ms: number };

export type RunStatus = "ok" | "TLE" | "MLE" | "OLE" | "RE" | "IE";

export type RunOutcome = {
  status: RunStatus;
  /** D2 — set to "wall" when a TLE was a wall-clock breach without a CPU breach. */
  reason?: "wall";
  stdout: string;
  stderr: string;
  cpuMs: number;
  wallMs: number;
  memoryKb?: number;
  exitCode: number | null;
  /**
   * Set only when `checker.type === "INTERACTIVE"`: the backend drove the
   * interaction itself (the interaction *is* the run) and already knows the
   * final verdict, so engine.ts skips checkOutput() for this case.
   */
  interactiveVerdict?: "AC" | "WA" | "PE" | "RE";
};

/**
 * One backend instance judges exactly one submission: compile once, run()
 * once per test case (across every group, in order), cleanup() once at the
 * end. This is the "warm container per submission" shape from D6 — pooling
 * containers *across* submissions is a worker-level concern for Phase 4.
 */
export interface JudgeBackend {
  readonly id: string;
  compile(opts: { language: LanguageSpec; source: string }): Promise<CompileResult>;
  run(opts: { input: string; limits: Limits; checker: Checker }): Promise<RunOutcome>;
  cleanup(): Promise<void>;
  /** Image provenance for the report, once known (after compile/first run). */
  imageRef?(): string | undefined;
}

export type BackendFactory = () => JudgeBackend;
export type BackendKind = "runner" | "judge0" | "local";

/**
 * Resolution order mirrors the pre-Phase-3 judge (src/lib/judge.ts):
 * self-hosted runner (Docker sandbox, multi-language) > Judge0 remote
 * (C-only fallback) > local in-process (dev only). `judgeV2`'s rollback path
 * is simply not calling into this module at all — see src/lib/judge.ts.
 *
 * The runner is health-checked *before* selection (not retried mid-job):
 * engine.ts's own error handling turns a connectivity failure into an `IE`
 * verdict, which is correct once a backend has been chosen but would hide a
 * "the runner happens to be down right now" case that should silently fall
 * through to the next backend instead — exactly what the pre-Phase-3
 * `judgeViaRunner` try/catch did for the runner-then-remote-or-local chain.
 */
export async function selectBackendFactory(): Promise<{ factory: BackendFactory; kind: BackendKind } | null> {
  const runnerUrl = runnerBaseUrl();
  if (runnerUrl && (await runnerHealthy(runnerUrl))) {
    return { kind: "runner", factory: () => new RunnerBackend(runnerUrl) };
  }

  const judge0Url = process.env.JUDGE0_URL?.trim();
  if (judge0Url) {
    return { kind: "judge0", factory: () => new Judge0Backend() };
  }

  return { kind: "local", factory: () => new LocalBackend() };
}

function runnerBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_RUNNER_URL?.trim();
  const token = process.env.RUNNER_TOKEN?.trim();
  if (!url || !token) return null;
  return url.replace(/^ws/, "http").replace(/\/+$/, "");
}

async function runnerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}
