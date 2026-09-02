import type { Prisma, Verdict } from "@prisma/client";
import type { ContestPhase } from "../contests";

export type ProblemMetaEntry = { title: string; difficulty: string | null; topic: string | null };

export type ProblemCell = {
  /** Rejected runs before the accepted one (or all of them, if still unsolved). */
  attempts: number;
  solved: boolean;
  /** Minutes from contest start to the accepted run — the ICPC clock. */
  solvedAtMin: number | null;
  firstBlood: boolean;
  /** Best score achieved on this problem — set by the partial-credit engines
   * (IOI/CF/assignment); undefined for ICPC, which only tracks solved/unsolved. */
  score?: number;
};

export type ScoreboardRow = {
  rank: number;
  userId: string;
  name: string;
  institutionId: string | null;
  institutionShortName: string | null;
  solved: number;
  penalty: number;
  points: number;
  cells: Record<string, ProblemCell>;
};

export type ContestProblemStat = {
  problemId: string;
  label: string;
  points: number;
  title: string;
  difficulty: string | null;
  topic: string | null;
  solvedCount: number;
  attemptedCount: number;
  firstSolver: { userId: string; name: string; atMin: number } | null;
  /** The viewer's own progress, never frozen — you always see your own runs. */
  mine: { solved: boolean; attempts: number; solvedAtMin: number | null } | null;
};

export type ContestSubmissionRow = {
  id: string;
  problemId: string;
  label: string;
  title: string;
  verdict: Verdict;
  atMin: number;
  createdAtMs: number;
};

export type ContestDashboardData = {
  /** Which engine produced this board — lets the UI pick a penalty column
   * (ICPC) vs. a score column (IOI/CF/assignment) without guessing from the
   * data shape. */
  scoring: "icpc" | "ioi" | "cf" | "assignment";
  phase: ContestPhase;
  startsAtMs: number | null;
  endsAtMs: number | null;
  serverNowMs: number;
  freezeAtMs: number | null;
  frozen: boolean;
  problems: ContestProblemStat[];
  rows: ScoreboardRow[];
  /** The viewer's standing even when they sit outside the visible rows. */
  viewer: ScoreboardRow | null;
  mySubmissions: ContestSubmissionRow[];
  totals: {
    participants: number;
    submissions: number;
    accepted: number;
    solvedByViewer: number;
    totalPoints: number;
  };
};

export type DashboardRegistration = {
  userId: string;
  user: {
    name: string;
    institutionId: string | null;
    institution: { shortName: string } | null;
  };
};
export type DashboardProblem = { problemId: string; label: string; points: number };
export type DashboardSubmission = {
  id: string;
  userId: string | null;
  problemId: string;
  verdict: Verdict;
  createdAt: Date;
  /** Group-weighted score out of the problem's points — used by IOI/CF, ignored by ICPC. */
  score?: number;
};

/** Shared shape every scoring engine consumes. Free of the database, so the
 * penalty/points maths and freeze cutoff can be exercised directly in tests. */
export type EngineInput = {
  registrations: DashboardRegistration[];
  contestProblems: DashboardProblem[];
  submissions: DashboardSubmission[];
  viewerId?: string | null;
  institutionId?: string;
  startsAt: Date | null;
  endsAt: Date | null;
  rules: Prisma.JsonValue | null | undefined;
  createdAt: Date;
  now?: number;
  practiceSolvedIds?: string[];
  /** Pre-resolved title/difficulty/topic per problemId — getContestDashboard
   * batches this via getProblem() before calling in, since engines stay
   * synchronous and DB-free for direct unit testing. */
  problemMeta?: Map<string, ProblemMetaEntry>;
};

/** One scoring rule (ICPC/IOI/CF/assignment) — a pure function from raw
 * contest data to the full dashboard payload. Each is independently
 * unit/property-testable; docs/phases/PHASE-05-contest-engine.md D3. */
export interface ScoringEngine {
  id: "icpc" | "ioi" | "cf" | "assignment";
  score(input: EngineInput): ContestDashboardData;
}
