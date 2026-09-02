import { prisma } from "./db";
import { log } from "./log";
import { issueCertificate } from "./certificates";
import type { ScoreboardRow } from "./scoring/types";

async function alreadyIssued(userId: string, type: string, contestId?: string): Promise<boolean> {
  const existing = await prisma.certificate.findFirst({
    where: { userId, type, contestId: contestId ?? null, revokedAt: null },
    select: { id: true },
  });
  return existing != null;
}

/** D6 — issued off the same final snapshot rating/badges consume, so a
 * participation certificate and a rank certificate always agree with the
 * board everyone actually saw. Idempotent per (user, type, contest). */
export async function issueContestCertificates(contestId: string): Promise<{ issued: number }> {
  const [contest, snapshot] = await Promise.all([
    prisma.contest.findUnique({ where: { id: contestId }, select: { title: true } }),
    prisma.contestStandingSnapshot.findFirst({
      where: { contestId, reason: "final" },
      orderBy: { version: "desc" },
    }),
  ]);
  if (!contest || !snapshot) return { issued: 0 };

  const rows = ((snapshot.standings as { rows?: ScoreboardRow[] } | null)?.rows ?? []).filter((r) => r.userId);
  if (rows.length === 0) return { issued: 0 };

  let issued = 0;
  for (const row of rows) {
    try {
      if (!(await alreadyIssued(row.userId, "contest_participation", contestId))) {
        await issueCertificate({
          type: "contest_participation",
          userId: row.userId,
          contestId,
          payload: { contestTitle: contest.title, fieldSize: rows.length, rank: row.rank },
        });
        issued++;
      }
      if (row.rank <= 3 && !(await alreadyIssued(row.userId, "contest_rank", contestId))) {
        await issueCertificate({
          type: "contest_rank",
          userId: row.userId,
          contestId,
          payload: { contestTitle: contest.title, fieldSize: rows.length, rank: row.rank },
        });
        issued++;
      }
    } catch (err) {
      log.error("certificate issuance failed", { contestId, userId: row.userId }, err);
    }
  }
  return { issued };
}

const MILESTONES = [100, 500, 1000];

/** Called after a solve_count badge check — issues a problem-milestone
 * certificate the moment a solver crosses 100/500/1000 solved. */
export async function issueMilestoneCertificateIfDue(userId: string, solvedCount: number): Promise<void> {
  const milestone = MILESTONES.find((m) => m === solvedCount);
  if (!milestone) return;

  // A user crosses multiple milestones over time, so idempotency is keyed on
  // the milestone value itself, not just "any milestone cert exists".
  const existing = await prisma.certificate.findFirst({
    where: { userId, type: "problem_milestone", payload: { path: ["milestone"], equals: milestone } },
    select: { id: true },
  });
  if (existing) return;

  try {
    await issueCertificate({ type: "problem_milestone", userId, payload: { milestone } });
  } catch (err) {
    log.error("milestone certificate issuance failed", { userId, milestone }, err);
  }
}
