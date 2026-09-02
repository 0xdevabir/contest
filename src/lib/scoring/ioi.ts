import { contestPhase, parseRules } from "../contests";
import { applyFreeze } from "./freeze";
import { assignRanks } from "./rank";
import type {
  ContestDashboardData,
  ContestProblemStat,
  ContestSubmissionRow,
  EngineInput,
  ProblemCell,
  ScoreboardRow,
  ScoringEngine,
} from "./types";

function minutesFrom(start: number, at: Date) {
  return Math.max(0, Math.floor((at.getTime() - start) / 60_000));
}

/**
 * Total = sum over problems of the best (max) score any submission achieved —
 * not the last submission. A student who scores 70 then 40 keeps 70. No
 * penalty; group dependencies are resolved by the judge (Phase 3), this
 * engine only sums. Tie-break: (-total, totalTimeOfBestSubmissions).
 */
export function scoreIoi(input: EngineInput): ContestDashboardData {
  const { registrations, contestProblems, submissions } = input;
  const problemMeta = input.problemMeta ?? new Map();
  const now = input.now ?? Date.now();
  const rules = parseRules(input.rules);
  const phase = contestPhase(input.startsAt, input.endsAt, now);
  const start = input.startsAt?.getTime() ?? input.createdAt.getTime();

  let freezeAt: Date | null = null;
  if (phase === "RUNNING" && input.endsAt && rules.freezeMinutes > 0) {
    freezeAt = new Date(input.endsAt.getTime() - rules.freezeMinutes * 60_000);
  }
  const frozen = Boolean(freezeAt && now >= freezeAt.getTime());
  const { visible } = applyFreeze(submissions, freezeAt, {
    isStaff: false,
    ownerOf: (s) => Boolean(input.viewerId) && s.userId === input.viewerId,
  });

  const problemIds = new Set(contestProblems.map((p) => p.problemId));
  const pointsOf = new Map(contestProblems.map((p) => [p.problemId, p.points]));
  const labelOf = new Map(contestProblems.map((p) => [p.problemId, p.label]));

  type Acc = { cells: Map<string, ProblemCell>; total: number; bestTime: number };
  const byUser = new Map<string, Acc>(registrations.map((r) => [r.userId, { cells: new Map(), total: 0, bestTime: 0 }]));
  const bestScore = new Map<string, Map<string, number>>(); // problemId -> userId -> best score so far
  const attemptedBy = new Map<string, Set<string>>();
  const solvedCount = new Map<string, number>();
  const mySubmissions: ContestSubmissionRow[] = [];
  const mine = new Map<string, { solved: boolean; attempts: number; solvedAtMin: number | null }>();
  let accepted = 0;

  for (const s of submissions) {
    if (!s.userId || !problemIds.has(s.problemId)) continue;
    const atMin = minutesFrom(start, s.createdAt);

    if (input.viewerId && s.userId === input.viewerId) {
      mySubmissions.push({
        id: s.id,
        problemId: s.problemId,
        label: labelOf.get(s.problemId) ?? "?",
        title: problemMeta.get(s.problemId)?.title ?? s.problemId,
        verdict: s.verdict,
        atMin,
        createdAtMs: s.createdAt.getTime(),
      });
      const own = mine.get(s.problemId) ?? { solved: false, attempts: 0, solvedAtMin: null };
      own.attempts += 1;
      const score = s.score ?? (s.verdict === "AC" ? (pointsOf.get(s.problemId) ?? 0) : 0);
      const max = pointsOf.get(s.problemId) ?? 0;
      if (!own.solved && score >= max && max > 0) {
        own.solved = true;
        own.solvedAtMin = atMin;
      }
      mine.set(s.problemId, own);
    }
  }

  for (const s of visible) {
    if (!s.userId || !problemIds.has(s.problemId)) continue;
    const acc = byUser.get(s.userId);
    if (!acc) continue;
    if (s.verdict === "AC") accepted += 1;

    if (!attemptedBy.has(s.problemId)) attemptedBy.set(s.problemId, new Set());
    attemptedBy.get(s.problemId)!.add(s.userId);

    const max = pointsOf.get(s.problemId) ?? 0;
    const score = Math.max(0, Math.min(max, s.score ?? (s.verdict === "AC" ? max : 0)));
    const atMin = minutesFrom(start, s.createdAt);

    let cell = acc.cells.get(s.problemId);
    if (!cell) {
      cell = { attempts: 0, solved: false, solvedAtMin: null, firstBlood: false };
      acc.cells.set(s.problemId, cell);
    }
    cell.attempts += 1;

    if (!bestScore.has(s.problemId)) bestScore.set(s.problemId, new Map());
    const problemBest = bestScore.get(s.problemId)!;
    const priorBest = problemBest.get(s.userId) ?? -1;
    if (score > priorBest) {
      problemBest.set(s.userId, score);
      acc.total += score - Math.max(priorBest, 0);
      acc.bestTime += atMin - (cell.solvedAtMin ?? 0);
      cell.solvedAtMin = atMin;
      cell.score = score;
      if (score >= max && max > 0 && !cell.solved) {
        cell.solved = true;
        solvedCount.set(s.problemId, (solvedCount.get(s.problemId) ?? 0) + 1);
      }
    }
  }

  const allRows: ScoreboardRow[] = registrations.map((r) => {
    const acc = byUser.get(r.userId)!;
    return {
      rank: 0,
      userId: r.userId,
      name: r.user.name,
      institutionId: r.user.institutionId,
      institutionShortName: r.user.institution?.shortName ?? null,
      solved: [...acc.cells.values()].filter((c) => c.solved).length,
      penalty: 0,
      points: acc.total,
      cells: Object.fromEntries(acc.cells),
    };
  });

  assignRanks(
    allRows,
    (a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const at = byUser.get(a.userId)!.bestTime;
      const bt = byUser.get(b.userId)!.bestTime;
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    },
    (a, b) => a.points === b.points && byUser.get(a.userId)!.bestTime === byUser.get(b.userId)!.bestTime
  );

  const rows = input.institutionId ? allRows.filter((r) => r.institutionId === input.institutionId) : allRows;
  const viewer = input.viewerId ? (allRows.find((r) => r.userId === input.viewerId) ?? null) : null;
  const practiceSolved = new Set(input.practiceSolvedIds ?? []);

  const problems: ContestProblemStat[] = contestProblems.map((p) => {
    const meta = problemMeta.get(p.problemId);
    const contestProgress = mine.get(p.problemId) ?? { solved: false, attempts: 0, solvedAtMin: null };
    const personalProgress =
      phase === "ENDED" && practiceSolved.has(p.problemId) ? { ...contestProgress, solved: true } : contestProgress;
    return {
      problemId: p.problemId,
      label: p.label,
      points: p.points,
      title: meta?.title ?? p.problemId,
      difficulty: meta?.difficulty ?? null,
      topic: meta?.topic ?? null,
      solvedCount: solvedCount.get(p.problemId) ?? 0,
      attemptedCount: attemptedBy.get(p.problemId)?.size ?? 0,
      firstSolver: null,
      mine: input.viewerId ? personalProgress : null,
    };
  });

  mySubmissions.reverse();

  return {
    scoring: "ioi",
    phase,
    startsAtMs: input.startsAt?.getTime() ?? null,
    endsAtMs: input.endsAt?.getTime() ?? null,
    serverNowMs: now,
    freezeAtMs: freezeAt?.getTime() ?? null,
    frozen,
    problems,
    rows,
    viewer,
    mySubmissions: mySubmissions.slice(0, 50),
    totals: {
      participants: registrations.length,
      submissions: submissions.length,
      accepted,
      solvedByViewer: problems.filter((p) => p.mine?.solved).length,
      totalPoints: contestProblems.reduce((sum, p) => sum + p.points, 0),
    },
  };
}

export const ioiEngine: ScoringEngine = { id: "ioi", score: scoreIoi };
