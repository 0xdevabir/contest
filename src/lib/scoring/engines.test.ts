import { describe, it, expect } from "vitest";
import type { Verdict } from "@prisma/client";
import { scoreIoi } from "./ioi";
import { scoreCf } from "./cf";
import { scoreAssignment, lateMultiplier } from "./assignment";
import type { DashboardRegistration, DashboardSubmission } from "./types";

const START = new Date("2026-01-01T10:00:00Z");
const END = new Date("2026-01-01T12:00:00Z"); // 120 minutes
const PROBLEMS = [{ problemId: "p1", label: "A", points: 100 }];
const REGISTRATIONS: DashboardRegistration[] = [
  { userId: "u1", user: { name: "Ada", institutionId: null, institution: null } },
  { userId: "u2", user: { name: "Linus", institutionId: null, institution: null } },
];
const at = (min: number) => new Date(START.getTime() + min * 60_000);

function sub(userId: string, problemId: string, verdict: Verdict, min: number, score?: number): DashboardSubmission {
  return { id: `${userId}-${min}`, userId, problemId, verdict, createdAt: at(min), score };
}

const baseOpts = {
  registrations: REGISTRATIONS,
  contestProblems: PROBLEMS,
  startsAt: START,
  endsAt: END,
  rules: { freezeMinutes: 0 },
  createdAt: START,
  now: END.getTime() + 60_000,
};

describe("ioi engine", () => {
  it("keeps the best score across submissions, not the last one", () => {
    const result = scoreIoi({
      ...baseOpts,
      submissions: [sub("u1", "p1", "PA", 10, 70), sub("u1", "p1", "PA", 20, 40)],
    });
    expect(result.rows.find((r) => r.userId === "u1")!.points).toBe(70);
  });

  it("ranks by total score descending, no penalty applied", () => {
    const result = scoreIoi({
      ...baseOpts,
      submissions: [sub("u1", "p1", "AC", 10, 100), sub("u2", "p1", "PA", 5, 40)],
    });
    expect(result.rows[0].userId).toBe("u1");
    expect(result.rows.every((r) => r.penalty === 0)).toBe(true);
  });
});

describe("cf engine", () => {
  it("decays score with time and never goes negative", () => {
    const early = scoreCf({ ...baseOpts, submissions: [sub("u1", "p1", "AC", 1, undefined)] });
    const late = scoreCf({ ...baseOpts, submissions: [sub("u2", "p1", "AC", 118, undefined)] });
    const earlyPts = early.rows.find((r) => r.userId === "u1")!.points;
    const latePts = late.rows.find((r) => r.userId === "u2")!.points;
    expect(earlyPts).toBeGreaterThan(latePts);
    expect(latePts).toBeGreaterThanOrEqual(0);
  });

  it("charges a flat 50 points per wrong attempt before AC", () => {
    const clean = scoreCf({ ...baseOpts, submissions: [sub("u1", "p1", "AC", 1)] });
    const withWrong = scoreCf({ ...baseOpts, submissions: [sub("u1", "p1", "WA", 0), sub("u1", "p1", "AC", 1)] });
    const cleanPts = clean.rows.find((r) => r.userId === "u1")!.points;
    const wrongPts = withWrong.rows.find((r) => r.userId === "u1")!.points;
    expect(cleanPts - wrongPts).toBe(50);
  });
});

describe("assignment engine lateMultiplier", () => {
  it("is full credit before the due date under every policy", () => {
    const due = at(60);
    expect(lateMultiplier(at(30), due, "none")).toBe(1);
    expect(lateMultiplier(at(30), due, "linear")).toBe(1);
    expect(lateMultiplier(at(30), due, "grace")).toBe(1);
  });

  it("'none' policy is all-or-nothing at the due date", () => {
    const due = at(60);
    expect(lateMultiplier(at(61), due, "none")).toBe(0);
  });

  it("'linear' policy decays 10%/day and floors at 0", () => {
    const due = new Date("2026-01-01T00:00:00Z");
    expect(lateMultiplier(new Date("2026-01-02T00:00:00Z"), due, "linear")).toBeCloseTo(0.9);
    expect(lateMultiplier(new Date("2026-01-20T00:00:00Z"), due, "linear")).toBe(0);
  });

  it("keeps its best-score-with-late-penalty total in the dashboard output", () => {
    const result = scoreAssignment({
      ...baseOpts,
      submissions: [sub("u1", "p1", "AC", 10, 100)],
    });
    expect(result.rows.find((r) => r.userId === "u1")!.points).toBe(100);
  });
});
