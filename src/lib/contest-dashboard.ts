import { prisma } from "./db";
import { parseRules } from "./contests";
import { getProblem } from "./problems";
import { pickEngine } from "./scoring";
import { assignRanks } from "./scoring/rank";
import type { ProblemMetaEntry, ProblemCell, ScoreboardRow, ContestDashboardData, EngineInput } from "./scoring/types";

export type {
  ContestPhase,
} from "./contests";
export type {
  ProblemCell,
  ScoreboardRow,
  ContestProblemStat,
  ContestSubmissionRow,
  ContestDashboardData,
  DashboardRegistration,
  DashboardProblem,
  DashboardSubmission,
  EngineInput,
} from "./scoring/types";

export async function getContestDashboard(
  contestId: string,
  opts: {
    viewerId?: string | null;
    institutionId?: string;
    startsAt: Date | null;
    endsAt: Date | null;
    rules: EngineInput["rules"];
    createdAt: Date;
  }
): Promise<ContestDashboardData> {
  const [registrations, contestProblems, submissions, practiceSolves] =
    await Promise.all([
    prisma.contestRegistration.findMany({
      where: { contestId },
      select: {
        userId: true,
        user: {
          select: { name: true, institutionId: true, institution: { select: { shortName: true } } },
        },
      },
    }),
    prisma.contestProblem.findMany({
      where: { contestId },
      orderBy: { order: "asc" },
      select: { problemId: true, label: true, points: true },
    }),
    prisma.submission.findMany({
      where: { contestId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        problemId: true,
        verdict: true,
        createdAt: true,
        score: true,
      },
    }),
    opts.viewerId
      ? prisma.solvedProblem.findMany({
          where: { userId: opts.viewerId },
          select: { problemId: true },
        })
      : Promise.resolve([]),
  ]);

  const problemMeta = new Map<string, ProblemMetaEntry>(
    await Promise.all(
      contestProblems.map(async (p) => {
        const meta = await getProblem(p.problemId);
        return [p.problemId, { title: meta?.title ?? p.problemId, difficulty: meta?.difficulty ?? null, topic: meta?.topic ?? null }] as const;
      })
    )
  );

  const dashboard = buildContestDashboard({
    registrations,
    contestProblems,
    submissions,
    practiceSolvedIds: practiceSolves.map((solve) => solve.problemId),
    problemMeta,
    ...opts,
  });

  const rules = parseRules(opts.rules);
  if (rules.teamSize <= 1) return dashboard;

  const teamOf = await teamMembershipMap(contestId);
  if (teamOf.size === 0) return dashboard;

  return mergeRowsByTeam(dashboard, teamOf, rules.penaltyPerWrong);
}

/** userId -> the team (if any) this user is participating as, for this contest. */
export async function teamMembershipMap(contestId: string): Promise<Map<string, { teamId: string; teamName: string }>> {
  const participations = await prisma.contestParticipation.findMany({
    where: { contestId, teamId: { not: null } },
    select: { userId: true, teamId: true },
  });
  const teamIds = [...new Set(participations.map((p) => p.teamId!))];
  if (teamIds.length === 0) return new Map();

  const teams = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } });
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));

  const map = new Map<string, { teamId: string; teamName: string }>();
  for (const p of participations) {
    if (!p.teamId) continue;
    map.set(p.userId, { teamId: p.teamId, teamName: nameOf.get(p.teamId) ?? p.teamId });
  }
  return map;
}

/**
 * D3 (docs/phases/PHASE-07-live-contest.md) — folds per-user rows into
 * per-team rows post-hoc, so the four scoring engines stay untouched and
 * DB-free. A team's cell for a problem is solved the moment any member
 * solves it (earliest `solvedAtMin` among solvers); `attempts` sums every
 * member's wrong tries on that cell, mirroring the single-account penalty
 * formula each engine already uses. Users without a team keep their own row.
 */
export function mergeRowsByTeam(
  dashboard: ContestDashboardData,
  teamOf: Map<string, { teamId: string; teamName: string }>,
  penaltyPerWrong: number
): ContestDashboardData {
  const pointsOf = new Map(dashboard.problems.map((p) => [p.problemId, p.points]));

  const groups = new Map<string, ScoreboardRow[]>();
  for (const row of dashboard.rows) {
    const key = teamOf.get(row.userId)?.teamId ?? `solo:${row.userId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const merged: ScoreboardRow[] = [];
  for (const members of groups.values()) {
    const team = teamOf.get(members[0].userId);
    if (!team) {
      merged.push(members[0]);
      continue;
    }

    const cells: Record<string, ProblemCell> = {};
    for (const member of members) {
      for (const [problemId, cell] of Object.entries(member.cells)) {
        const cur = cells[problemId];
        if (!cur) {
          cells[problemId] = { ...cell };
          continue;
        }
        cells[problemId] = {
          attempts: cur.attempts + cell.attempts,
          solved: cur.solved || cell.solved,
          solvedAtMin:
            cur.solved && cell.solved
              ? Math.min(cur.solvedAtMin ?? Infinity, cell.solvedAtMin ?? Infinity)
              : cur.solved
                ? cur.solvedAtMin
                : cell.solved
                  ? cell.solvedAtMin
                  : null,
          firstBlood: cur.firstBlood || cell.firstBlood,
          score: Math.max(cur.score ?? 0, cell.score ?? 0),
        };
      }
    }

    const solvedCells = Object.entries(cells).filter(([, c]) => c.solved);
    const isIcpc = dashboard.scoring === "icpc";
    const solved = solvedCells.length;
    const penalty = isIcpc
      ? solvedCells.reduce((sum, [, c]) => sum + (c.solvedAtMin ?? 0) + c.attempts * penaltyPerWrong, 0)
      : 0;
    const points = isIcpc
      ? solvedCells.reduce((sum, [problemId]) => sum + (pointsOf.get(problemId) ?? 0), 0)
      : Object.values(cells).reduce((sum, c) => sum + (c.score ?? 0), 0);

    merged.push({
      rank: 0,
      userId: team.teamId,
      name: team.teamName,
      institutionId: members[0].institutionId,
      institutionShortName: members[0].institutionShortName,
      solved,
      penalty,
      points,
      cells,
    });
  }

  const isIcpc = dashboard.scoring === "icpc";
  assignRanks(
    merged,
    (a, b) => {
      if (isIcpc) {
        if (b.solved !== a.solved) return b.solved - a.solved;
        if (a.penalty !== b.penalty) return a.penalty - b.penalty;
      } else if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.name.localeCompare(b.name);
    },
    (a, b) => (isIcpc ? a.solved === b.solved && a.penalty === b.penalty : a.points === b.points)
  );

  const viewerTeamId = dashboard.viewer ? teamOf.get(dashboard.viewer.userId)?.teamId : undefined;
  const viewer = viewerTeamId ? (merged.find((r) => r.userId === viewerTeamId) ?? dashboard.viewer) : dashboard.viewer;

  return { ...dashboard, rows: merged, viewer };
}

/**
 * Orchestrator (docs/phases/PHASE-05-contest-engine.md D3): load data, pick
 * the scoring engine from `rules.scoring`, call it, return the dashboard
 * payload. The scoring itself — penalty maths, freeze cutoff, ranking — lives
 * in src/lib/scoring/*.ts, one pure/DB-free module per engine so each is
 * independently unit- and property-testable.
 */
export function buildContestDashboard(input: EngineInput): ContestDashboardData {
  const rules = parseRules(input.rules);
  return pickEngine(rules.scoring).score(input);
}
