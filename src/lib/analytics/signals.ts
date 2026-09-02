/**
 * D2 (docs/phases/PHASE-08-analytics.md) — at-risk detection. Pure and
 * side-effect free: takes a plain data bundle so the whole signal set is
 * unit-tested with fixtures rather than a seeded database. A student is
 * flagged at-risk when 2+ signals fire (never a lone signal, never a score).
 */

export type SignalKey =
  | "inactivity"
  | "assignmentMiss"
  | "notStarted"
  | "decliningTrend"
  | "strugglePattern"
  | "neverSolved";

export type SignalResult = { key: SignalKey; sentence: string };

/** One graded assignment result for the trend/miss signals, in submission order. */
export type AssignmentScore = {
  assignmentId: string;
  title: string;
  percent: number; // 0-100
  dueAt: Date | null;
  submissionCount: number;
};

export type StudentSignalInput = {
  now: Date;
  /** Date of the student's most recent submission in this section, if any. */
  lastSubmissionAt: Date | null;
  /** True while at least one assignment in the section is currently open. */
  hasOpenAssignment: boolean;
  /** Chronological (oldest first) graded/published assignment results. */
  assignmentScores: AssignmentScore[];
  /** Assignments due within 48h with zero submissions from this student. */
  upcomingUnstarted: { title: string; dueAt: Date }[];
  studentMedianAttemptsToAc: number | null;
  cohortMedianAttemptsToAc: number | null;
  enrolledAt: Date;
  everSolvedCount: number;
};

const INACTIVITY_DAYS = 7;
const NEVER_SOLVED_ENROLLED_DAYS = 14;
const ASSIGNMENT_MISS_THRESHOLD = 0.4;
const STRUGGLE_MULTIPLIER = 2;
const UPCOMING_DUE_HOURS = 48;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function evaluateSignals(input: StudentSignalInput): SignalResult[] {
  const signals: SignalResult[] = [];

  // Inactivity: no submission in 7+ days while an assignment is open.
  if (input.hasOpenAssignment) {
    if (!input.lastSubmissionAt) {
      const enrolledDays = Math.floor(daysBetween(input.now, input.enrolledAt));
      if (enrolledDays >= INACTIVITY_DAYS) {
        signals.push({ key: "inactivity", sentence: `No activity for ${enrolledDays} days` });
      }
    } else {
      const idleDays = Math.floor(daysBetween(input.now, input.lastSubmissionAt));
      if (idleDays >= INACTIVITY_DAYS) {
        signals.push({ key: "inactivity", sentence: `No activity for ${idleDays} days` });
      }
    }
  }

  // Assignment miss: < 40% on the most recent graded assignment.
  const mostRecent = input.assignmentScores[input.assignmentScores.length - 1];
  if (mostRecent && mostRecent.percent < ASSIGNMENT_MISS_THRESHOLD * 100) {
    signals.push({
      key: "assignmentMiss",
      sentence: `Scored ${Math.round(mostRecent.percent)}% on ${mostRecent.title}`,
    });
  }

  // Not started: assignment due < 48h, zero submissions.
  for (const a of input.upcomingUnstarted) {
    const hoursLeft = (a.dueAt.getTime() - input.now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft >= 0 && hoursLeft < UPCOMING_DUE_HOURS) {
      const dueText = hoursLeft <= 24 ? "due tomorrow" : `due in ${Math.ceil(hoursLeft / 24)} days`;
      signals.push({ key: "notStarted", sentence: `Hasn't started ${a.title} (${dueText})` });
    }
  }

  // Declining trend: last 3 assignments each lower than the previous.
  const lastThree = input.assignmentScores.slice(-3);
  if (
    lastThree.length === 3 &&
    lastThree[0].percent > lastThree[1].percent &&
    lastThree[1].percent > lastThree[2].percent
  ) {
    signals.push({ key: "decliningTrend", sentence: "Scores declining over 3 assignments" });
  }

  // Struggle pattern: median attempts-to-AC > 2x the cohort median.
  if (
    input.studentMedianAttemptsToAc != null &&
    input.cohortMedianAttemptsToAc != null &&
    input.cohortMedianAttemptsToAc > 0 &&
    input.studentMedianAttemptsToAc > STRUGGLE_MULTIPLIER * input.cohortMedianAttemptsToAc
  ) {
    signals.push({
      key: "strugglePattern",
      sentence: `Needs ${Math.round(input.studentMedianAttemptsToAc)} attempts where the class needs ${Math.round(input.cohortMedianAttemptsToAc)}`,
    });
  }

  // Never solved: enrolled 14+ days, zero AC.
  const enrolledDays = daysBetween(input.now, input.enrolledAt);
  if (enrolledDays >= NEVER_SOLVED_ENROLLED_DAYS && input.everSolvedCount === 0) {
    signals.push({ key: "neverSolved", sentence: "Has never solved a problem here" });
  }

  return signals;
}

export function isAtRisk(signals: SignalResult[]): boolean {
  return signals.length >= 2;
}
