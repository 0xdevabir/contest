import { describe, expect, it } from "vitest";
import { evaluateSignals, isAtRisk, type StudentSignalInput } from "./signals";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const ENROLLED_LONG_AGO = new Date("2026-01-01T00:00:00.000Z");

function baseInput(overrides: Partial<StudentSignalInput> = {}): StudentSignalInput {
  return {
    now: NOW,
    lastSubmissionAt: NOW,
    hasOpenAssignment: false,
    assignmentScores: [],
    upcomingUnstarted: [],
    studentMedianAttemptsToAc: null,
    cohortMedianAttemptsToAc: null,
    enrolledAt: ENROLLED_LONG_AGO,
    everSolvedCount: 3,
    ...overrides,
  };
}

describe("inactivity signal", () => {
  it("does not fire when no assignment is open", () => {
    const signals = evaluateSignals(
      baseInput({ hasOpenAssignment: false, lastSubmissionAt: new Date("2026-01-01") })
    );
    expect(signals.find((s) => s.key === "inactivity")).toBeUndefined();
  });

  it("fires at the 7-day boundary while an assignment is open", () => {
    const sixDaysAgo = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(
      evaluateSignals(baseInput({ hasOpenAssignment: true, lastSubmissionAt: sixDaysAgo })).find(
        (s) => s.key === "inactivity"
      )
    ).toBeUndefined();
    expect(
      evaluateSignals(baseInput({ hasOpenAssignment: true, lastSubmissionAt: sevenDaysAgo })).find(
        (s) => s.key === "inactivity"
      )
    ).toBeDefined();
  });
});

describe("assignment miss signal", () => {
  it("fires under 40% on the most recent graded assignment, not at/above it", () => {
    const under = evaluateSignals(
      baseInput({
        assignmentScores: [{ assignmentId: "a1", title: "A1", percent: 39, dueAt: null, submissionCount: 1 }],
      })
    );
    expect(under.find((s) => s.key === "assignmentMiss")).toBeDefined();

    const atThreshold = evaluateSignals(
      baseInput({
        assignmentScores: [{ assignmentId: "a1", title: "A1", percent: 40, dueAt: null, submissionCount: 1 }],
      })
    );
    expect(atThreshold.find((s) => s.key === "assignmentMiss")).toBeUndefined();
  });
});

describe("not started signal", () => {
  it("fires only inside the 48h window before due", () => {
    const in48h = evaluateSignals(
      baseInput({ upcomingUnstarted: [{ title: "HW", dueAt: new Date(NOW.getTime() + 47 * 60 * 60 * 1000) }] })
    );
    expect(in48h.find((s) => s.key === "notStarted")).toBeDefined();

    const beyond48h = evaluateSignals(
      baseInput({ upcomingUnstarted: [{ title: "HW", dueAt: new Date(NOW.getTime() + 49 * 60 * 60 * 1000) }] })
    );
    expect(beyond48h.find((s) => s.key === "notStarted")).toBeUndefined();
  });
});

describe("declining trend signal", () => {
  it("fires only on 3 strictly decreasing scores", () => {
    const declining = evaluateSignals(
      baseInput({
        assignmentScores: [
          { assignmentId: "a1", title: "A1", percent: 90, dueAt: null, submissionCount: 1 },
          { assignmentId: "a2", title: "A2", percent: 70, dueAt: null, submissionCount: 1 },
          { assignmentId: "a3", title: "A3", percent: 50, dueAt: null, submissionCount: 1 },
        ],
      })
    );
    expect(declining.find((s) => s.key === "decliningTrend")).toBeDefined();

    const flat = evaluateSignals(
      baseInput({
        assignmentScores: [
          { assignmentId: "a1", title: "A1", percent: 70, dueAt: null, submissionCount: 1 },
          { assignmentId: "a2", title: "A2", percent: 70, dueAt: null, submissionCount: 1 },
          { assignmentId: "a3", title: "A3", percent: 50, dueAt: null, submissionCount: 1 },
        ],
      })
    );
    expect(flat.find((s) => s.key === "decliningTrend")).toBeUndefined();
  });
});

describe("struggle pattern signal", () => {
  it("fires only when the student needs more than 2x the cohort median attempts", () => {
    const atBoundary = evaluateSignals(
      baseInput({ studentMedianAttemptsToAc: 6, cohortMedianAttemptsToAc: 3 })
    );
    expect(atBoundary.find((s) => s.key === "strugglePattern")).toBeUndefined();

    const overBoundary = evaluateSignals(
      baseInput({ studentMedianAttemptsToAc: 7, cohortMedianAttemptsToAc: 3 })
    );
    expect(overBoundary.find((s) => s.key === "strugglePattern")).toBeDefined();
  });
});

describe("never solved signal", () => {
  it("fires at 14+ enrolled days with zero AC, not before", () => {
    const thirteenDaysAgo = new Date(NOW.getTime() - 13 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000);

    expect(
      evaluateSignals(baseInput({ enrolledAt: thirteenDaysAgo, everSolvedCount: 0 })).find(
        (s) => s.key === "neverSolved"
      )
    ).toBeUndefined();
    expect(
      evaluateSignals(baseInput({ enrolledAt: fourteenDaysAgo, everSolvedCount: 0 })).find(
        (s) => s.key === "neverSolved"
      )
    ).toBeDefined();
    expect(
      evaluateSignals(baseInput({ enrolledAt: fourteenDaysAgo, everSolvedCount: 1 })).find(
        (s) => s.key === "neverSolved"
      )
    ).toBeUndefined();
  });
});

describe("isAtRisk", () => {
  it("requires 2+ signals — one signal alone is not at risk", () => {
    const fourteenDaysAgo = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000);

    const oneSignal = evaluateSignals(baseInput({ enrolledAt: fourteenDaysAgo, everSolvedCount: 0 }));
    expect(oneSignal).toHaveLength(1);
    expect(isAtRisk(oneSignal)).toBe(false);

    const twoSignals = evaluateSignals(
      baseInput({
        enrolledAt: fourteenDaysAgo,
        everSolvedCount: 0,
        hasOpenAssignment: true,
        lastSubmissionAt: new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000),
      })
    );
    expect(twoSignals.length).toBeGreaterThanOrEqual(2);
    expect(isAtRisk(twoSignals)).toBe(true);
  });
});
