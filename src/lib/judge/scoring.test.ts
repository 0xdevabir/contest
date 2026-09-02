import { describe, it, expect } from "vitest";
import { dependenciesSatisfied, scoreGroup, overallVerdict, totalScore, totalMaxScore } from "./scoring";
import type { GroupReport } from "./protocol";

function group(overrides: Partial<GroupReport>): GroupReport {
  return { group: 0, verdict: "AC", score: 100, points: 100, skipped: false, ...overrides };
}

describe("scoreGroup", () => {
  it("awards full points when every case is AC", () => {
    expect(scoreGroup(40, ["AC", "AC", "AC"])).toEqual({ verdict: "AC", score: 40 });
  });

  it("is binary: any non-AC case zeroes the whole group", () => {
    expect(scoreGroup(40, ["AC", "WA", "AC"])).toEqual({ verdict: "WA", score: 0 });
  });

  it("reports the first non-AC verdict, not the last", () => {
    expect(scoreGroup(40, ["TLE", "WA"])).toEqual({ verdict: "TLE", score: 0 });
  });

  it("treats an empty (mis-authored) group as WA, never AC", () => {
    expect(scoreGroup(40, [])).toEqual({ verdict: "WA", score: 0 });
  });
});

describe("dependenciesSatisfied", () => {
  it("is vacuously true with no dependencies", () => {
    expect(dependenciesSatisfied([], new Map())).toBe(true);
  });

  it("requires every dependency to be fully scored", () => {
    const prior = new Map([[1, group({ group: 1, score: 30, points: 30 })]]);
    expect(dependenciesSatisfied([1], prior)).toBe(true);
  });

  it("fails when a dependency scored less than its points", () => {
    const prior = new Map([[1, group({ group: 1, score: 0, points: 30 })]]);
    expect(dependenciesSatisfied([1], prior)).toBe(false);
  });

  it("fails when a dependency was itself skipped", () => {
    const prior = new Map([[1, group({ group: 1, skipped: true, score: 0, points: 30 })]]);
    expect(dependenciesSatisfied([1], prior)).toBe(false);
  });

  it("fails when a dependency hasn't run yet", () => {
    expect(dependenciesSatisfied([1], new Map())).toBe(false);
  });
});

describe("overallVerdict", () => {
  it("is AC when every group is fully scored", () => {
    const groups = [group({ group: 0 }), group({ group: 1 })];
    expect(overallVerdict(groups)).toBe("AC");
  });

  it("is PA when some but not all groups are fully scored (subtask credit)", () => {
    const groups = [group({ group: 0, score: 30, points: 30 }), group({ group: 1, verdict: "WA", score: 0, points: 70 })];
    expect(overallVerdict(groups)).toBe("PA");
  });

  it("is the first non-AC group's verdict when nothing scored", () => {
    const groups = [
      group({ group: 0, verdict: "WA", score: 0 }),
      group({ group: 1, verdict: "TLE", score: 0 }),
    ];
    expect(overallVerdict(groups)).toBe("WA");
  });

  it("skips skipped groups when picking the first failure", () => {
    const groups = [
      group({ group: 0, skipped: true, verdict: "SKIP", score: 0 }),
      group({ group: 1, verdict: "RE", score: 0 }),
    ];
    expect(overallVerdict(groups)).toBe("RE");
  });

  it("a fully-skipped submission (e.g. total dependency failure) is not AC", () => {
    const groups = [group({ group: 0, skipped: true, verdict: "SKIP", score: 0 })];
    expect(overallVerdict(groups)).not.toBe("AC");
  });
});

describe("totalScore / totalMaxScore", () => {
  it("sums across groups regardless of skip status", () => {
    const groups = [
      group({ group: 0, score: 30, points: 30 }),
      group({ group: 1, skipped: true, score: 0, points: 70 }),
    ];
    expect(totalScore(groups)).toBe(30);
    expect(totalMaxScore(groups)).toBe(100);
  });
});
