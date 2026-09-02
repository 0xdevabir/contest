import type { Checker, CheckerTypeName, JudgeJob, JudgeReport } from "./protocol";
import { JUDGE_PROTOCOL_VERSION } from "./protocol";
import { judge } from "./engine";
import { selectBackendFactory } from "./backends/index";
import { requireEnabledLanguage, scaledLimits } from "./languages/registry";

export { listEnabledLanguages, listLanguages, getLanguage, findLanguage } from "./languages/registry";
export type { LanguageSpec } from "./languages/registry";
export type { JudgeJob, JudgeReport, Checker, Limits } from "./protocol";

export type EngineTestGroup = {
  group: number;
  name?: string;
  points: number;
  dependsOn?: number[];
  stopOnFail?: boolean;
  cases: { index: number; input: string; expected: string; sample?: boolean }[];
};

export type JudgeSubmissionOptions = {
  submissionId: string;
  language: string;
  source: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitKb?: number;
  checker?: { type: CheckerTypeName; epsilon?: number; programSource?: string; programLanguage?: string };
  groups: EngineTestGroup[];
  stopOnFirstFail?: boolean;
  revealSampleOutput?: boolean;
};

/**
 * Public entry point for Phase 3's judge engine: resolves the language,
 * scales its limits (D2/D3), selects a backend (runner > Judge0 > local,
 * src/lib/judge/backends/index.ts), builds a protocol-v1 JudgeJob and runs
 * it through engine.ts. src/lib/judge.ts is the `judgeV2`-flag-gated
 * compatibility shim that calls this for legacy (flat, single-language)
 * callers; new call sites (grouped, multi-language problems) should call
 * this directly once problems carry real TestGroup data end to end.
 */
export async function judgeSubmission(opts: JudgeSubmissionOptions): Promise<JudgeReport> {
  const lang = requireEnabledLanguage(opts.language);
  const limits = scaledLimits(lang, { timeLimitMs: opts.timeLimitMs, memoryLimitMb: opts.memoryLimitMb });

  const checker: Checker = {
    type: opts.checker?.type ?? "TOKEN",
    epsilon: opts.checker?.epsilon,
    programSource: opts.checker?.programSource,
    programLanguage: opts.checker?.programLanguage,
  };

  const job: JudgeJob = {
    protocol: JUDGE_PROTOCOL_VERSION,
    submissionId: opts.submissionId,
    kind: "submit",
    language: lang.id,
    source: opts.source,
    limits: {
      cpuMs: limits.cpuMs,
      wallMs: limits.wallMs,
      memoryMb: limits.memoryMb,
      outputKb: opts.outputLimitKb ?? 512,
      processes: 64,
    },
    checker,
    groups: opts.groups.map((g) => ({
      group: g.group,
      name: g.name ?? "main",
      points: g.points,
      dependsOn: g.dependsOn ?? [],
      stopOnFail: g.stopOnFail ?? true,
      cases: g.cases.map((c) => ({ index: c.index, input: c.input, expected: c.expected, sample: c.sample ?? false })),
    })),
    policy: {
      stopOnFirstFail: opts.stopOnFirstFail ?? false,
      revealSampleOutput: opts.revealSampleOutput ?? true,
    },
  };

  const selected = await selectBackendFactory();
  if (!selected) {
    return {
      protocol: JUDGE_PROTOCOL_VERSION,
      submissionId: opts.submissionId,
      verdict: "IE",
      score: 0,
      maxScore: job.groups.reduce((s, g) => s + g.points, 0),
      compile: { ok: false, stderr: "", ms: 0 },
      groups: [],
      tests: [],
      judge: { workerId: "none", durationMs: 0 },
      message: "Judge is not configured.",
    };
  }

  const backend = selected.factory();
  return judge(job, backend, selected.kind);
}

/** Ungraded custom-input run: one case, no scoring, used by the "Run" action. */
export async function runCustomV2(opts: {
  submissionId: string;
  language: string;
  source: string;
  stdin: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitKb?: number;
}): Promise<JudgeReport> {
  return judgeSubmission({
    submissionId: opts.submissionId,
    language: opts.language,
    source: opts.source,
    timeLimitMs: opts.timeLimitMs,
    memoryLimitMb: opts.memoryLimitMb,
    outputLimitKb: opts.outputLimitKb,
    checker: { type: "EXACT" },
    groups: [{ group: 0, points: 0, stopOnFail: false, cases: [{ index: 0, input: opts.stdin, expected: "", sample: true }] }],
    revealSampleOutput: true,
  });
}
