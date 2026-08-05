import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(100),
  university: z.enum(["DIU", "NSU", "AIUB", "BRAC"]),
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

export const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(100),
});

export const contestRulesSchema = z.object({
  freezeMinutes: z.number().int().min(0).max(600).default(60),
  penaltyPerWrong: z.number().int().min(0).max(60).default(20),
  maxSubmissionsPerProblem: z.number().int().min(0).max(500).default(0),
  allowPracticeAfter: z.boolean().default(true),
  showSamples: z.boolean().default(true),
  languages: z.array(z.string()).default(["c"]),
  notes: z.string().max(2000).optional(),
});

export type ContestRules = z.infer<typeof contestRulesSchema>;

export const defaultContestRules: ContestRules = {
  freezeMinutes: 60,
  penaltyPerWrong: 20,
  maxSubmissionsPerProblem: 0,
  allowPracticeAfter: true,
  showSamples: true,
  languages: ["c"],
  notes: "",
};
