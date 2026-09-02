import { z } from "zod";

/**
 * The judge protocol — docs/ULTIMATE_PLAN.md Appendix C. Phase 3 implements
 * it synchronously (engine.ts calls a backend in-process and gets a
 * JudgeReport back); Phase 4 puts a queue between the job and the report
 * without changing either shape. Frozen once Phase 4 ships — breaking
 * changes bump `protocol`.
 */
export const JUDGE_PROTOCOL_VERSION = 1;

export const CheckerTypeSchema = z.enum(["EXACT", "TOKEN", "FLOAT", "SPECIAL", "INTERACTIVE"]);
export type CheckerTypeName = z.infer<typeof CheckerTypeSchema>;

export const CheckerSchema = z.object({
  type: CheckerTypeSchema,
  /** FLOAT only. */
  epsilon: z.number().positive().optional(),
  /** SPECIAL/INTERACTIVE only — source of the teacher-authored program. */
  programSource: z.string().optional(),
  programLanguage: z.string().optional(),
});
export type Checker = z.infer<typeof CheckerSchema>;

export const LimitsSchema = z.object({
  cpuMs: z.number().int().positive(),
  wallMs: z.number().int().positive(),
  memoryMb: z.number().int().positive(),
  outputKb: z.number().int().positive(),
  processes: z.number().int().positive().default(64),
});
export type Limits = z.infer<typeof LimitsSchema>;

export const JobTestCaseSchema = z.object({
  index: z.number().int().nonnegative(),
  input: z.string(),
  expected: z.string(),
  sample: z.boolean().default(false),
});
export type JobTestCase = z.infer<typeof JobTestCaseSchema>;

export const JobGroupSchema = z.object({
  group: z.number().int().nonnegative(),
  name: z.string().default("main"),
  points: z.number().int().nonnegative().default(100),
  /** Group numbers that must fully pass before this group is attempted. */
  dependsOn: z.array(z.number().int()).default([]),
  stopOnFail: z.boolean().default(true),
  cases: z.array(JobTestCaseSchema),
});
export type JobGroup = z.infer<typeof JobGroupSchema>;

export const JudgeJobSchema = z.object({
  protocol: z.literal(JUDGE_PROTOCOL_VERSION),
  submissionId: z.string(),
  kind: z.enum(["submit", "run", "rejudge", "validate"]).default("submit"),
  language: z.string(),
  source: z.string(),
  limits: LimitsSchema,
  checker: CheckerSchema,
  groups: z.array(JobGroupSchema),
  policy: z.object({
    stopOnFirstFail: z.boolean().default(false),
    revealSampleOutput: z.boolean().default(true),
  }),
});
export type JudgeJob = z.infer<typeof JudgeJobSchema>;

export const TestReportSchema = z.object({
  index: z.number().int(),
  verdict: z.string(),
  cpuMs: z.number().int().nonnegative(),
  wallMs: z.number().int().nonnegative(),
  memoryKb: z.number().int().nonnegative().optional(),
  /** "wall" when TLE was a wall-clock breach without a CPU breach — D2. */
  reason: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  message: z.string().optional(),
});
export type TestReport = z.infer<typeof TestReportSchema>;

export const GroupReportSchema = z.object({
  group: z.number().int(),
  verdict: z.string(),
  score: z.number().int(),
  points: z.number().int(),
  skipped: z.boolean().default(false),
});
export type GroupReport = z.infer<typeof GroupReportSchema>;

export const JudgeReportSchema = z.object({
  protocol: z.literal(JUDGE_PROTOCOL_VERSION),
  submissionId: z.string(),
  verdict: z.string(),
  score: z.number().int(),
  maxScore: z.number().int(),
  compile: z.object({ ok: z.boolean(), stderr: z.string().default(""), ms: z.number().int().nonnegative() }),
  groups: z.array(GroupReportSchema),
  tests: z.array(TestReportSchema),
  maxCpuMs: z.number().int().nonnegative().optional(),
  maxWallMs: z.number().int().nonnegative().optional(),
  maxMemoryKb: z.number().int().nonnegative().optional(),
  judge: z.object({ workerId: z.string().default("local"), image: z.string().optional(), durationMs: z.number().int().nonnegative() }),
  message: z.string().optional(),
});
export type JudgeReport = z.infer<typeof JudgeReportSchema>;
