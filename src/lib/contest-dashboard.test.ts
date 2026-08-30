import { describe, it, expect } from "vitest";
import type { Verdict } from "@prisma/client";
import {
  buildContestDashboard,
  type DashboardRegistration,
  type DashboardSubmission,
} from "./contest-dashboard";
import { contestProblemHref, contestSubmissionError } from "./contest-access";

/**
 * Ported from the deleted scripts/check-contest-scoring.ts (Phase 0 retires
 * the ad-hoc check scripts in favor of one test runner).
 */

const START = new Date("2026-01-01T10:00:00Z");
const END = new Date("2026-01-01T12:00:00Z"); // 120 minutes
const RULES = { penaltyPerWrong: 20, freezeMinutes: 30 };

const at = (min: number) => new Date(START.getTime() + min * 60_000);
let seq = 0;
const sub = (userId: string, problemId: string, verdict: Verdict, min: number): DashboardSubmission => ({
  id: `s${seq++}`,
  userId,
  problemId,
  verdict,
  createdAt: at(min),
});

const registrations: DashboardRegistration[] = [
  { userId: "u1", user: { name: "Ada", university: "DIU" } },
  { userId: "u2", user: { name: "Linus", university: "DIU" } },
  { userId: "u3", user: { name: "Grace", university: "NSU" } },
  { userId: "u4", user: { name: "Idle", university: null } },
];

const contestProblems = [
  { problemId: "p1", label: "A", points: 100 },
  { problemId: "p2", label: "B", points: 200 },
];

function freshSubmissions(): DashboardSubmission[] {
  seq = 0;
  return [
    // Ada: A wrong at 5, wrong at 8, accepted at 10 -> 10 + 2*20 = 50
    sub("u1", "p1", "WA", 5),
    sub("u1", "p1", "RE", 8),
    sub("u1", "p1", "AC", 10),
    // Ada: B never solved, two wrongs -> no penalty
    sub("u1", "p2", "WA", 40),
    sub("u1", "p2", "TLE", 50),
    // Linus: A clean at 30 -> 30. B accepted at 60 -> 60. total 90
    sub("u2", "p1", "AC", 30),
    sub("u2", "p2", "AC", 60),
    // Grace: A compile error (free) then accepted at 15 -> 15
    sub("u3", "p1", "CE", 12),
    sub("u3", "p1", "AC", 15),
    // Grace: B accepted at 100, inside the freeze window (freeze starts at 90)
    sub("u3", "p2", "AC", 100),
    // Idle only shows up during the freeze — must stay invisible until the end
    sub("u4", "p1", "WA", 95),
    // A submission after AC must be ignored entirely
    sub("u1", "p1", "WA", 70),
  ];
}

function run(now: Date) {
  return buildContestDashboard({
    registrations,
    contestProblems,
    submissions: freshSubmissions(),
    viewerId: "u1",
    startsAt: START,
    endsAt: END,
    rules: RULES,
    createdAt: START,
    now: now.getTime(),
  });
}

describe("buildContestDashboard", () => {
  it("computes penalty as solve minute + wrongs * penaltyPerWrong", () => {
    const live = run(at(85));
    expect(live.rows.find((r) => r.name === "Ada")!.penalty).toBe(50);
    expect(live.rows.find((r) => r.name === "Ada")!.solved).toBe(1);
  });

  it("treats compile errors as free (not penalised)", () => {
    const live = run(at(85));
    expect(live.rows.find((r) => r.name === "Grace")!.penalty).toBe(15);
  });

  it("marks first blood correctly", () => {
    const live = run(at(85));
    expect(live.rows.find((r) => r.name === "Ada")!.cells.p1.firstBlood).toBe(true);
    expect(live.rows.find((r) => r.name === "Grace")!.cells.p1.firstBlood).toBe(false);
    expect(live.problems[0].firstSolver?.name).toBe("Ada");
  });

  it("ranks by solved desc, then penalty asc, with a stable idle row", () => {
    const live = run(at(85));
    expect(live.rows.find((r) => r.name === "Linus")!.solved).toBe(2);
    expect(live.rows.find((r) => r.name === "Linus")!.penalty).toBe(90);
    expect(live.rows[0].name).toBe("Linus");
    expect(live.rows[1].name).toBe("Grace");
    expect(live.rows[3].name).toBe("Idle");
    expect(live.rows[3].rank).toBe(4);
  });

  it("hides everything past the freeze cutoff, including derived stats", () => {
    const frozen = run(at(100));
    expect(frozen.frozen).toBe(true);
    expect(frozen.rows.find((r) => r.name === "Grace")!.solved).toBe(1);
    expect(frozen.rows[0].name).toBe("Linus");
    expect(frozen.problems[1].solvedCount).toBe(1);
    expect(frozen.problems[0].attemptedCount).toBe(3);
    expect(frozen.rows.find((r) => r.name === "Idle")!.cells.p1).toBeUndefined();
    expect(frozen.totals.accepted).toBe(4);
  });

  it("reveals everything once the contest has ended", () => {
    const ended = run(new Date(END.getTime() + 60_000));
    expect(ended.frozen).toBe(false);
    expect(ended.rows.find((r) => r.name === "Grace")!.solved).toBe(2);
    expect(ended.rows.find((r) => r.name === "Grace")!.penalty).toBe(115);
    expect(ended.rows[0].name).toBe("Linus");
    expect(ended.rows[1].name).toBe("Grace");
    expect(ended.problems[0].attemptedCount).toBe(4);
    expect(ended.totals.accepted).toBe(5);
  });

  it("merges a past practice solve into personal progress after the contest ends", () => {
    const pastPractice = buildContestDashboard({
      registrations,
      contestProblems,
      submissions: freshSubmissions(),
      viewerId: "u1",
      startsAt: START,
      endsAt: END,
      rules: RULES,
      createdAt: START,
      now: END.getTime() + 60_000,
      practiceSolvedIds: ["p2"],
    });
    expect(pastPractice.problems.find((p) => p.problemId === "p2")!.mine!.solved).toBe(true);
    expect(pastPractice.totals.solvedByViewer).toBe(2);
  });

  it("never freezes the viewer's own progress", () => {
    const frozen = run(at(100));
    const viewer = frozen.problems.find((p) => p.problemId === "p1")!;
    expect(viewer.mine!.solved).toBe(true);
    expect(viewer.mine!.attempts).toBe(2);
    expect(viewer.mine!.solvedAtMin).toBe(10);
    expect(frozen.viewer!.name).toBe("Ada");
    expect(viewer.solvedCount).toBe(3);
    expect(viewer.attemptedCount).toBe(3);
    expect(frozen.mySubmissions.length).toBe(6);
    expect(frozen.mySubmissions[0].atMin).toBe(70);
  });
});

describe("contestProblemHref", () => {
  it("opens a live problem in contest mode for a joined contestant", () => {
    expect(
      contestProblemHref({ phase: "RUNNING", registered: true, contestId: "contest-1", problemId: "problem-a" })
    ).toBe("/problems/problem-a?contest=contest-1");
  });
  it("blocks an unregistered contestant from a live problem", () => {
    expect(
      contestProblemHref({ phase: "RUNNING", registered: false, contestId: "contest-1", problemId: "problem-a" })
    ).toBeNull();
  });
  it("opens a past problem as normal practice", () => {
    expect(
      contestProblemHref({ phase: "ENDED", registered: false, contestId: "contest-1", problemId: "problem-a" })
    ).toBe("/problems/problem-a");
  });
  it("keeps problems locked before the contest starts", () => {
    expect(
      contestProblemHref({ phase: "BEFORE", registered: true, contestId: "contest-1", problemId: "problem-a" })
    ).toBeNull();
  });
});

describe("contestSubmissionError", () => {
  it("allows a joined user to submit a listed problem during a live contest", () => {
    expect(
      contestSubmissionError({ contestOpen: true, contestEnded: false, problemIncluded: true, registered: true })
    ).toBeNull();
  });
  it("rejects users who did not join a live contest", () => {
    expect(
      contestSubmissionError({ contestOpen: true, contestEnded: false, problemIncluded: true, registered: false })
    ).toBe("Register for the contest first");
  });
  it("rejects a problem outside the contest", () => {
    expect(
      contestSubmissionError({ contestOpen: true, contestEnded: false, problemIncluded: false, registered: true })
    ).toBe("This problem is not part of the contest");
  });
  it("sends submissions after a contest ends to practice mode", () => {
    expect(
      contestSubmissionError({ contestOpen: false, contestEnded: true, problemIncluded: true, registered: true })
    ).toBe("This contest has ended — reopen the problem from the past contest to practise.");
  });
});
