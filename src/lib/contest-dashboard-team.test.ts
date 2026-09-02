import { describe, it, expect } from "vitest";
import { mergeRowsByTeam } from "./contest-dashboard";
import type { ContestDashboardData, ScoreboardRow } from "./scoring/types";

function row(userId: string, over: Partial<ScoreboardRow> = {}): ScoreboardRow {
  return {
    rank: 0,
    userId,
    name: userId,
    institutionId: null,
    institutionShortName: null,
    solved: 0,
    penalty: 0,
    points: 0,
    cells: {},
    ...over,
  };
}

function dashboard(rows: ScoreboardRow[], over: Partial<ContestDashboardData> = {}): ContestDashboardData {
  return {
    scoring: "icpc",
    phase: "RUNNING",
    startsAtMs: 0,
    endsAtMs: 100,
    serverNowMs: 50,
    freezeAtMs: null,
    frozen: false,
    problems: [
      { problemId: "p1", label: "A", points: 100, title: "A", difficulty: null, topic: null, solvedCount: 0, attemptedCount: 0, firstSolver: null, mine: null },
      { problemId: "p2", label: "B", points: 100, title: "B", difficulty: null, topic: null, solvedCount: 0, attemptedCount: 0, firstSolver: null, mine: null },
    ],
    rows,
    viewer: null,
    mySubmissions: [],
    totals: { participants: rows.length, submissions: 0, accepted: 0, solvedByViewer: 0, totalPoints: 200 },
    ...over,
  };
}

describe("mergeRowsByTeam (docs/phases/PHASE-07-live-contest.md D3)", () => {
  it("a solo (non-team) user keeps their own row unchanged", () => {
    const solo = row("solo1", { solved: 1, penalty: 20 });
    const result = mergeRowsByTeam(dashboard([solo]), new Map(), 20);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ userId: "solo1", solved: 1, penalty: 20 });
  });

  it("credits a problem to the team the moment any member solves it", () => {
    const a = row("alice", { cells: { p1: { attempts: 0, solved: true, solvedAtMin: 10, firstBlood: true } } });
    const b = row("bob", { cells: { p1: { attempts: 2, solved: false, solvedAtMin: null, firstBlood: false } } });
    const teamOf = new Map([
      ["alice", { teamId: "team-1", teamName: "Team Rocket" }],
      ["bob", { teamId: "team-1", teamName: "Team Rocket" }],
    ]);
    const result = mergeRowsByTeam(dashboard([a, b]), teamOf, 20);
    expect(result.rows).toHaveLength(1);
    const teamRow = result.rows[0];
    expect(teamRow.userId).toBe("team-1");
    expect(teamRow.name).toBe("Team Rocket");
    expect(teamRow.solved).toBe(1);
    // penalty = solvedAtMin (10) + combined attempts (0 + 2) * penaltyPerWrong (20)
    expect(teamRow.penalty).toBe(10 + 2 * 20);
    expect(teamRow.points).toBe(100);
  });

  it("keeps the earliest solve time when two teammates both solve the same problem", () => {
    const a = row("alice", { cells: { p1: { attempts: 0, solved: true, solvedAtMin: 30, firstBlood: false } } });
    const b = row("bob", { cells: { p1: { attempts: 1, solved: true, solvedAtMin: 15, firstBlood: false } } });
    const teamOf = new Map([
      ["alice", { teamId: "team-1", teamName: "Team Rocket" }],
      ["bob", { teamId: "team-1", teamName: "Team Rocket" }],
    ]);
    const result = mergeRowsByTeam(dashboard([a, b]), teamOf, 20);
    expect(result.rows[0].cells.p1.solvedAtMin).toBe(15);
  });

  it("carries the viewer's row over to their merged team row", () => {
    const a = row("alice", { solved: 1, cells: { p1: { attempts: 0, solved: true, solvedAtMin: 10, firstBlood: false } } });
    const b = row("bob", { solved: 0 });
    const teamOf = new Map([
      ["alice", { teamId: "team-1", teamName: "Team Rocket" }],
      ["bob", { teamId: "team-1", teamName: "Team Rocket" }],
    ]);
    const result = mergeRowsByTeam(dashboard([a, b], { viewer: a }), teamOf, 20);
    expect(result.viewer?.userId).toBe("team-1");
  });

  it("ranks teams by solved desc, then penalty asc (ICPC)", () => {
    const a = row("alice", {
      cells: {
        p1: { attempts: 0, solved: true, solvedAtMin: 40, firstBlood: false },
        p2: { attempts: 0, solved: true, solvedAtMin: 60, firstBlood: false },
      },
    });
    const b = row("carl", {
      cells: {
        p1: { attempts: 0, solved: true, solvedAtMin: 20, firstBlood: false },
        p2: { attempts: 0, solved: true, solvedAtMin: 30, firstBlood: false },
      },
    });
    const teamOf = new Map([
      ["alice", { teamId: "team-a", teamName: "Alpha" }],
      ["carl", { teamId: "team-b", teamName: "Beta" }],
    ]);
    const result = mergeRowsByTeam(dashboard([a, b]), teamOf, 20);
    // both teams have one member here, so the merge is a passthrough on
    // cells, but rank must still be reassigned from scratch (penalty
    // 100 for Alpha vs. 50 for Beta).
    expect(result.rows.map((r) => r.userId)).toEqual(["team-b", "team-a"]);
    expect(result.rows[0].rank).toBe(1);
    expect(result.rows[1].rank).toBe(2);
  });
});
