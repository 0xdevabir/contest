import type { Verdict } from "@prisma/client";
import { contestPhase } from "../contests";
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
import { parseRules } from "../contests";

/**
 * Total = solved count; penalty = time-to-AC plus wrong attempts. Extracted
 * verbatim from the pre-Phase-5 `buildContestDashboard` (docs/phases/
 * PHASE-05-contest-engine.md D3 step 1) — this is the golden-fixture-gated
 * function: `contest-dashboard.test.ts` must keep passing unchanged.
 *
 * Rejected verdicts that cost penalty time: `WA/RE/TLE/MLE/OLE/PA`. Never
 * counted: `CE` (a slip, not an attempt), `IE` (an infrastructure fault,
 * never the submitter's fault), `SKIP`.
 */
const PENALISED: Verdict[] = ["WA", "RE", "TLE", "MLE", "OLE", "PA"];

function minutesFrom(start: number, at: Date) {
  return Math.max(0, Math.floor((at.getTime() - start) / 60_000));
}

export function scoreIcpc(input: EngineInput): ContestDashboardData {
  const { registrations, contestProblems, submissions } = input;
  const problemMeta = input.problemMeta ?? new Map();
  const opts = input;
  const now = input.now ?? Date.now();
  const rules = parseRules(opts.rules);
  const phase = contestPhase(opts.startsAt, opts.endsAt, now);
  const start = opts.startsAt?.getTime() ?? opts.createdAt.getTime();

  // The board only hides late results while the contest is still running; once
  // it is over everyone sees the full result.
  let freezeAt: Date | null = null;
  if (phase === "RUNNING" && opts.endsAt && rules.freezeMinutes > 0) {
    freezeAt = new Date(opts.endsAt.getTime() - rules.freezeMinutes * 60_000);
  }
  const frozen = Boolean(freezeAt && now >= freezeAt.getTime());

  const problemIds = new Set(contestProblems.map((p) => p.problemId));
  const pointsOf = new Map(contestProblems.map((p) => [p.problemId, p.points]));
  const labelOf = new Map(contestProblems.map((p) => [p.problemId, p.label]));
  const nameOf = new Map(registrations.map((r) => [r.userId, r.user.name]));

  type Acc = {
    cells: Map<string, ProblemCell>;
    solved: number;
    penalty: number;
    points: number;
    lastAcMs: number;
  };
  const makeAcc = (): Acc => ({
    cells: new Map(),
    solved: 0,
    penalty: 0,
    points: 0,
    lastAcMs: 0,
  });
  const cellFor = (acc: Acc, problemId: string) => {
    let cell = acc.cells.get(problemId);
    if (!cell) {
      cell = { attempts: 0, solved: false, solvedAtMin: null, firstBlood: false };
      acc.cells.set(problemId, cell);
    }
    return cell;
  };

  const byUser = new Map<string, Acc>();
  for (const r of registrations) byUser.set(r.userId, makeAcc());

  // Viewer progress is tracked separately so the freeze never hides it from them.
  const mine = new Map<string, { solved: boolean; attempts: number; solvedAtMin: number | null }>();
  const solvedCount = new Map<string, number>();
  const attemptedBy = new Map<string, Set<string>>();
  const firstSolver = new Map<string, { userId: string; name: string; atMin: number }>();
  const mySubmissions: ContestSubmissionRow[] = [];
  let accepted = 0;

  for (const s of submissions) {
    if (!s.userId || !problemIds.has(s.problemId)) continue;

    const atMin = minutesFrom(start, s.createdAt);

    if (opts.viewerId && s.userId === opts.viewerId) {
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
      if (!own.solved) {
        if (s.verdict === "AC") {
          own.solved = true;
          own.solvedAtMin = atMin;
        } else if (PENALISED.includes(s.verdict)) {
          own.attempts += 1;
        }
      }
      mine.set(s.problemId, own);
    }

    // Everything past the freeze is invisible on the public board — not just the
    // standings, but the solve counts and the first-solver line too, which would
    // otherwise say who broke a problem during the frozen stretch.
    if (freezeAt && s.createdAt.getTime() > freezeAt.getTime()) continue;

    if (s.verdict === "AC") accepted += 1;

    if (!attemptedBy.has(s.problemId)) attemptedBy.set(s.problemId, new Set());
    attemptedBy.get(s.problemId)!.add(s.userId);

    if (s.verdict === "AC" && !firstSolver.has(s.problemId)) {
      firstSolver.set(s.problemId, {
        userId: s.userId,
        name: nameOf.get(s.userId) ?? "Unknown",
        atMin,
      });
    }

    const acc = byUser.get(s.userId);
    if (!acc) continue;
    const cell = cellFor(acc, s.problemId);
    if (cell.solved) continue;

    if (s.verdict === "AC") {
      cell.solved = true;
      cell.solvedAtMin = atMin;
      acc.solved += 1;
      acc.points += pointsOf.get(s.problemId) ?? 0;
      acc.penalty += atMin + cell.attempts * rules.penaltyPerWrong;
      acc.lastAcMs = s.createdAt.getTime();
      solvedCount.set(s.problemId, (solvedCount.get(s.problemId) ?? 0) + 1);
    } else if (PENALISED.includes(s.verdict)) {
      cell.attempts += 1;
    }
  }

  for (const [problemId, first] of firstSolver) {
    const acc = byUser.get(first.userId);
    const cell = acc?.cells.get(problemId);
    if (cell?.solved) cell.firstBlood = true;
  }

  const allRows: ScoreboardRow[] = registrations.map((r) => {
    const acc = byUser.get(r.userId)!;
    return {
      rank: 0,
      userId: r.userId,
      name: r.user.name,
      institutionId: r.user.institutionId,
      institutionShortName: r.user.institution?.shortName ?? null,
      solved: acc.solved,
      penalty: acc.penalty,
      points: acc.points,
      cells: Object.fromEntries(acc.cells),
    };
  });

  // Standard competition ranking: an identical score shares a rank. The name
  // tiebreak only makes the sort order deterministic — it must not split a
  // genuine tie into separate ranks, so it's excluded from `sameRank`.
  assignRanks(
    allRows,
    (a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved;
      if (a.penalty !== b.penalty) return a.penalty - b.penalty;
      return a.name.localeCompare(b.name);
    },
    (a, b) => a.solved === b.solved && a.penalty === b.penalty
  );

  const rows = opts.institutionId
    ? allRows.filter((r) => r.institutionId === opts.institutionId)
    : allRows;
  const viewer = opts.viewerId
    ? (allRows.find((r) => r.userId === opts.viewerId) ?? null)
    : null;
  const practiceSolved = new Set(input.practiceSolvedIds ?? []);

  const problems: ContestProblemStat[] = contestProblems.map((p) => {
    const meta = problemMeta.get(p.problemId);
    const contestProgress = mine.get(p.problemId) ?? {
      solved: false,
      attempts: 0,
      solvedAtMin: null,
    };
    const personalProgress =
      phase === "ENDED" && practiceSolved.has(p.problemId)
        ? { ...contestProgress, solved: true }
        : contestProgress;
    return {
      problemId: p.problemId,
      label: p.label,
      points: p.points,
      title: meta?.title ?? p.problemId,
      difficulty: meta?.difficulty ?? null,
      topic: meta?.topic ?? null,
      solvedCount: solvedCount.get(p.problemId) ?? 0,
      attemptedCount: attemptedBy.get(p.problemId)?.size ?? 0,
      firstSolver: firstSolver.get(p.problemId) ?? null,
      mine: opts.viewerId ? personalProgress : null,
    };
  });

  mySubmissions.reverse();

  return {
    scoring: "icpc",
    phase,
    startsAtMs: opts.startsAt?.getTime() ?? null,
    endsAtMs: opts.endsAt?.getTime() ?? null,
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

export const icpcEngine: ScoringEngine = { id: "icpc", score: scoreIcpc };
