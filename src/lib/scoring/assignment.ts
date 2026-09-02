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

export type LatePolicy = "none" | "linear" | "grace";

/**
 * `none`: full credit up to the due date, 0 after. `linear`: −10%/day late,
 * floored at 0. `grace`: full credit within 24h of the due date, then linear.
 * Phase 6 (classroom assignments) is the primary caller and will pass richer
 * per-student due dates; Phase 5 wires the contest's own `endsAt` as a single
 * shared due date so the engine is usable standalone in the meantime.
 */
export function lateMultiplier(submittedAt: Date, dueAt: Date | null, policy: LatePolicy = "none"): number {
  if (!dueAt || submittedAt.getTime() <= dueAt.getTime()) return 1;
  const lateDays = (submittedAt.getTime() - dueAt.getTime()) / 86_400_000;
  if (policy === "none") return 0;
  if (policy === "grace") return lateDays <= 1 ? 1 : Math.max(0, 1 - 0.1 * (lateDays - 1));
  return Math.max(0, 1 - 0.1 * lateDays);
}

function minutesFrom(start: number, at: Date) {
  return Math.max(0, Math.floor((at.getTime() - start) / 60_000));
}

/**
 * Total = Σ over problems (bestScore × lateMultiplier) + manualMarks.
 * `manualMarks` (teacher-entered per-problem adjustments that survive
 * rejudges) has no storage yet — Phase 6 adds it; this engine always sums 0
 * for it today, so it's a safe no-op until then.
 */
export function scoreAssignment(input: EngineInput): ContestDashboardData {
  const { registrations, contestProblems, submissions } = input;
  const problemMeta = input.problemMeta ?? new Map();
  const now = input.now ?? Date.now();
  const rules = parseRules(input.rules);
  const phase = contestPhase(input.startsAt, input.endsAt, now);
  const start = input.startsAt?.getTime() ?? input.createdAt.getTime();
  const dueAt = input.endsAt ?? null;

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

  type Acc = { cells: Map<string, ProblemCell>; total: number };
  const byUser = new Map<string, Acc>(registrations.map((r) => [r.userId, { cells: new Map(), total: 0 }]));
  const bestByUserProblem = new Map<string, number>(); // `${userId}:${problemId}` -> best adjusted score
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
      const max = pointsOf.get(s.problemId) ?? 0;
      const score = s.score ?? (s.verdict === "AC" ? max : 0);
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
    const rawScore = Math.max(0, Math.min(max, s.score ?? (s.verdict === "AC" ? max : 0)));
    const adjusted = rawScore * lateMultiplier(s.createdAt, dueAt);

    let cell = acc.cells.get(s.problemId);
    if (!cell) {
      cell = { attempts: 0, solved: false, solvedAtMin: null, firstBlood: false };
      acc.cells.set(s.problemId, cell);
    }
    cell.attempts += 1;

    const key = `${s.userId}:${s.problemId}`;
    const prior = bestByUserProblem.get(key) ?? -1;
    if (adjusted > prior) {
      bestByUserProblem.set(key, adjusted);
      acc.total += adjusted - Math.max(prior, 0);
      cell.solvedAtMin = minutesFrom(start, s.createdAt);
      cell.score = adjusted;
      if (adjusted >= max && max > 0 && !cell.solved) {
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
      points: Math.round(acc.total),
      cells: Object.fromEntries(acc.cells),
    };
  });

  assignRanks(
    allRows,
    (a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name)),
    (a, b) => a.points === b.points
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
    scoring: "assignment",
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

export const assignmentEngine: ScoringEngine = { id: "assignment", score: scoreAssignment };
