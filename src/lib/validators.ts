import { z } from "zod";

/** Real display name — not a unique @handle. Shown on leaderboards, emails, etc. */
export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Name is required")
  .max(80, "Name is too long")
  .refine((v) => /[\p{L}]/u.test(v), {
    message: "Name must include letters",
  })
  .refine((v) => /^[\p{L}\p{M}'’.\-\s]+$/u.test(v), {
    message: "Use your real name (letters and spaces). Not a username like “devabir07”.",
  });

export const registerSchema = z.object({
  name: personNameSchema,
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(100),
  institutionId: z.string().trim().min(1, "Choose your institution"),
  accountType: z.enum(["STUDENT", "TEACHER"]).default("STUDENT"),
  teacherNote: z.string().trim().max(500).optional().or(z.literal("")),
  studentId: z.string().trim().max(40).optional().or(z.literal("")),
  department: z.string().trim().max(80).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const forgotSchema = z.object({
  email: z.string().trim().email(),
});

export const verifyResetCodeSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{8}$/, "Enter the 8-digit code"),
});

export const resetSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{8}$/, "Enter the 8-digit code"),
  password: z.string().min(8).max(100),
});

/** Legacy (pre-Phase-5) shape — kept only so `parseRules` can upgrade old
 * `Contest.rules` blobs that predate `rulesVersion`. Not used for new writes. */
export const contestRulesSchemaV1 = z.object({
  freezeMinutes: z.number().int().min(0).max(600).default(60),
  penaltyPerWrong: z.number().int().min(0).max(60).default(20),
  maxSubmissionsPerProblem: z.number().int().min(0).max(500).default(0),
  publishAfterEnd: z.boolean().default(false),
  allowPracticeAfter: z.boolean().default(true),
  showSamples: z.boolean().default(true),
  languages: z.array(z.string()).default(["c"]),
  notes: z.string().max(2000).optional(),
});

export type ContestRulesV1 = z.infer<typeof contestRulesSchemaV1>;

export const defaultContestRulesV1: ContestRulesV1 = {
  freezeMinutes: 60,
  penaltyPerWrong: 20,
  maxSubmissionsPerProblem: 0,
  publishAfterEnd: false,
  allowPracticeAfter: true,
  showSamples: true,
  languages: ["c"],
  notes: "",
};

/**
 * Phase 5 (docs/phases/PHASE-05-contest-engine.md D6). `Contest.rules` stays a
 * JSON blob — a normalised table of ~20 settings buys nothing and costs a
 * join — but is now validated and versioned so old contests keep parsing
 * unchanged when defaults change. `parseRules` in src/lib/contests.ts is the
 * only place that reads this; it upgrades v1 blobs (missing `rulesVersion`)
 * on read, never touching the stored row.
 */
export const contestRulesSchemaV2 = z.object({
  rulesVersion: z.literal(2).default(2),
  scoring: z.enum(["icpc", "ioi", "cf", "assignment"]).default("icpc"),
  freezeMinutes: z.number().int().min(0).max(600).default(60),
  unfreezeOnEnd: z.boolean().default(true),
  penaltyPerWrong: z.number().int().min(0).max(120).default(20),
  maxSubmissionsPerProblem: z.number().int().min(0).max(500).default(0),
  submissionCooldownSec: z.number().int().min(0).max(600).default(0),
  /** [] = all languages enabled. */
  languages: z.array(z.string()).default([]),
  showSamples: z.boolean().default(true),
  showTestVerdicts: z.enum(["none", "first-fail", "all"]).default("first-fail"),
  allowPracticeAfter: z.boolean().default(true),
  allowVirtual: z.boolean().default(true),
  lateJoin: z.boolean().default(true),
  /** 0 = until the contest ends. */
  lateJoinMinutes: z.number().int().min(0).default(0),
  rated: z.boolean().default(false),
  ratingCategory: z.enum(["global", "institution", "none"]).default("global"),
  teamSize: z.number().int().min(1).max(3).default(1),
  /** Phase 10 (integrity/lockdown mode). */
  strictMode: z.boolean().default(false),
  publishAfterEnd: z.boolean().default(false),
  notes: z.string().max(4000).default(""),
});

export type ContestRulesV2 = z.infer<typeof contestRulesSchemaV2>;

export const defaultContestRulesV2: ContestRulesV2 = contestRulesSchemaV2.parse({});

/** Current version — what every new write and every call site outside
 * `parseRules` itself should use. */
export const contestRulesSchema = contestRulesSchemaV2;
export type ContestRules = ContestRulesV2;
export const defaultContestRules = defaultContestRulesV2;
