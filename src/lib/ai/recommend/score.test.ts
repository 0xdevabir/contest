import { describe, it, expect } from "vitest";
import { DEFAULT_WEIGHTS, rankCandidates, scoreProblem, type CandidateProblem, type StudentContext } from "./score";

const student = (overrides: Partial<StudentContext> = {}): StudentContext => ({
  rating: 1200,
  tagMastery: new Map(),
  curriculumTagIds: new Set(),
  recentTagIds: [],
  ...overrides,
});

const problem = (overrides: Partial<CandidateProblem> = {}): CandidateProblem => ({
  id: "p1",
  elo: 1300,
  tags: [{ tagId: "dp", weight: 3 }],
  ...overrides,
});

describe("scoreProblem — difficultyFit", () => {
  it("peaks around +100 Elo above the student's rating (testing plan)", () => {
    const s = student({ rating: 1200 });
    const at100 = scoreProblem(problem({ elo: 1300 }), s, undefined);
    const at0 = scoreProblem(problem({ elo: 1200 }), s, undefined);
    const at400 = scoreProblem(problem({ elo: 1600 }), s, undefined);
    expect(at100.difficultyFit).toBeGreaterThan(at0.difficultyFit);
    expect(at100.difficultyFit).toBeGreaterThan(at400.difficultyFit);
  });
});

describe("scoreProblem — tagNeed", () => {
  it("ranks weak tags first: lower mastery scores higher tagNeed", () => {
    const weakTag = student({ tagMastery: new Map([["dp", 0.1]]) });
    const strongTag = student({ tagMastery: new Map([["dp", 0.9]]) });
    const p = problem({ tags: [{ tagId: "dp", weight: 3 }] });
    expect(scoreProblem(p, weakTag, undefined).tagNeed).toBeGreaterThan(scoreProblem(p, strongTag, undefined).tagNeed);
  });

  it("treats an untracked tag (never attempted) as maximum need", () => {
    const s = student({ tagMastery: new Map() });
    expect(scoreProblem(problem(), s, undefined).tagNeed).toBe(1);
  });
});

describe("scoreProblem — freshness", () => {
  it("suppresses a problem the student recently failed", () => {
    const now = new Date("2026-01-15T00:00:00Z");
    const s = student();
    const recentlyFailed = scoreProblem(problem(), s, { attempted: true, solved: false, lastAttemptAt: new Date("2026-01-14T00:00:00Z") }, now);
    const neverAttempted = scoreProblem(problem(), s, undefined, now);
    expect(recentlyFailed.freshness).toBeLessThan(neverAttempted.freshness);
  });

  it("treats an already-solved problem as not fresh at all", () => {
    const s = student();
    const solved = scoreProblem(problem(), s, { attempted: true, solved: true, lastAttemptAt: new Date() }, new Date());
    expect(solved.freshness).toBe(0);
  });
});

describe("scoreProblem — repetition", () => {
  it("penalises a tag that dominates the recent streak", () => {
    const repeated = student({ recentTagIds: ["dp", "dp", "dp", "dp", "dp"] });
    const varied = student({ recentTagIds: ["graph", "greedy", "math", "strings", "dp"] });
    const p = problem({ tags: [{ tagId: "dp", weight: 3 }] });
    const repeatedScore = scoreProblem(p, repeated, undefined);
    const variedScore = scoreProblem(p, varied, undefined);
    expect(repeatedScore.repetition).toBeGreaterThan(variedScore.repetition);
    expect(repeatedScore.total).toBeLessThan(variedScore.total);
  });
});

describe("rankCandidates", () => {
  it("orders highest score first and breaks ties deterministically by id", () => {
    const s = student();
    const problems = [problem({ id: "b", elo: 1300 }), problem({ id: "a", elo: 1300 })];
    const ranked = rankCandidates(problems, s, new Map());
    expect(ranked.map((r) => r.problemId)).toEqual(["a", "b"]);
  });

  it("uses DEFAULT_WEIGHTS when none are passed", () => {
    const s = student();
    const ranked = rankCandidates([problem()], s, new Map());
    expect(ranked[0].score.total).toBeCloseTo(scoreProblem(problem(), s, undefined, new Date(), DEFAULT_WEIGHTS).total, 5);
  });
});
