/**
 * Exercises the contest scoring without a database. Run with `npx tsx`.
 */
import type { Verdict } from "@prisma/client";
import {
  buildContestDashboard,
  type DashboardRegistration,
  type DashboardSubmission,
} from "../src/lib/contest-dashboard";

const START = new Date("2026-01-01T10:00:00Z");
const END = new Date("2026-01-01T12:00:00Z"); // 120 minutes
const RULES = { penaltyPerWrong: 20, freezeMinutes: 30 };

const at = (min: number) => new Date(START.getTime() + min * 60_000);
let seq = 0;
const sub = (
  userId: string,
  problemId: string,
  verdict: Verdict,
  min: number
): DashboardSubmission => ({
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

const submissions: DashboardSubmission[] = [
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

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  expected ${e}, got ${a}`}`);
  if (!ok) process.exitCode = 1;
}

function run(label: string, now: Date) {
  console.log(`\n--- ${label} (t=${Math.round((now.getTime() - START.getTime()) / 60_000)}min) ---`);
  const d = buildContestDashboard({
    registrations,
    contestProblems,
    submissions,
    viewerId: "u1",
    startsAt: START,
    endsAt: END,
    rules: RULES,
    createdAt: START,
    now: now.getTime(),
  });
  console.log(`phase=${d.phase} frozen=${d.frozen}`);
  for (const r of d.rows) {
    const cells = contestProblems
      .map((p) => {
        const c = r.cells[p.problemId];
        if (!c) return `${p.label}:·`;
        return `${p.label}:${c.solved ? `+${c.attempts}@${c.solvedAtMin}${c.firstBlood ? "*" : ""}` : `-${c.attempts}`}`;
      })
      .join(" ");
    console.log(`  #${r.rank} ${r.name.padEnd(6)} solved=${r.solved} penalty=${r.penalty} pts=${r.points}  ${cells}`);
  }
  return d;
}

// Mid-contest, before the freeze at minute 90.
const live = run("live, unfrozen", at(85));
check("Ada penalty (10 + 2 wrongs x 20)", live.rows.find((r) => r.name === "Ada")!.penalty, 50);
check("Ada unsolved B costs nothing", live.rows.find((r) => r.name === "Ada")!.solved, 1);
check("Grace compile error is free", live.rows.find((r) => r.name === "Grace")!.penalty, 15);
// Ada solved A at minute 10, ahead of Grace at 15.
check("Ada takes first blood on A", live.rows.find((r) => r.name === "Ada")!.cells.p1.firstBlood, true);
check("Grace does not", live.rows.find((r) => r.name === "Grace")!.cells.p1.firstBlood, false);
check("first solver of A", live.problems[0].firstSolver?.name, "Ada");
check("Linus two solves", live.rows.find((r) => r.name === "Linus")!.solved, 2);
check("Linus penalty 30+60", live.rows.find((r) => r.name === "Linus")!.penalty, 90);
check("leader is Linus", live.rows[0].name, "Linus");
check("Grace ranked above Ada on penalty", live.rows[1].name, "Grace");
check("idle contestant still listed", live.rows[3].name, "Idle");
check("Idle rank", live.rows[3].rank, 4);

// Inside the freeze: Grace's minute-100 solve must be hidden.
const frozen = run("live, frozen", at(100));
check("freeze is active", frozen.frozen, true);
check("Grace's late solve hidden", frozen.rows.find((r) => r.name === "Grace")!.solved, 1);
check("Linus still leads while frozen", frozen.rows[0].name, "Linus");
// The freeze has to cover the derived stats too, not just the standings table.
check("B solve count frozen at 1", frozen.problems[1].solvedCount, 1);
check("late attempt hidden from counts", frozen.problems[0].attemptedCount, 3);
check("late attempt hidden from cells", frozen.rows.find((r) => r.name === "Idle")!.cells.p1, undefined);
check("accepted total frozen", frozen.totals.accepted, 4);

// After the end nothing is hidden any more.
const ended = run("finished", new Date(END.getTime() + 60_000));
check("no freeze after the end", ended.frozen, false);
check("Grace's late solve revealed", ended.rows.find((r) => r.name === "Grace")!.solved, 2);
check("Grace penalty 15 + 100", ended.rows.find((r) => r.name === "Grace")!.penalty, 115);
check("Linus wins the tie on penalty", ended.rows[0].name, "Linus");
check("Grace second", ended.rows[1].name, "Grace");
check("late attempt revealed", ended.problems[0].attemptedCount, 4);
check("accepted total revealed", ended.totals.accepted, 5);

// Viewer specifics are never frozen.
const viewer = frozen.problems.find((p) => p.problemId === "p1")!;
check("viewer sees own solve", viewer.mine!.solved, true);
check("viewer sees own retries", viewer.mine!.attempts, 2);
check("viewer solve minute", viewer.mine!.solvedAtMin, 10);
check("viewer row exposed", frozen.viewer!.name, "Ada");
check("problem A solve count", viewer.solvedCount, 3);
check("problem A attempted by", viewer.attemptedCount, 3);
check("viewer's own runs listed", frozen.mySubmissions.length, 6);
check("newest run first", frozen.mySubmissions[0].atMin, 70);

console.log(
  process.exitCode === 1 ? "\nSOME CHECKS FAILED" : "\nAll scoring checks passed."
);

