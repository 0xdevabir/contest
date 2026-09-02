import { prisma } from "../db";
import { log } from "../log";
import { normalizeSource } from "./normalize";
import { kgramHashes, winnow } from "./winnow";
import { alignRegions, boilerplateHashes, jaccard, sharedCount, zScore, excludeHashes } from "./compare";

export type ScopeType = "contest" | "section" | "assignment" | "global";

/** Minimum shared fingerprint hashes before a pair is even worth an exact
 * Jaccard check — D1's "candidate generation" cheap pre-filter. */
const MIN_SHARED_HASHES = 3;
const PERSIST_Z_THRESHOLD = 3;
const PERSIST_SIMILARITY_THRESHOLD = 0.9;

type Candidate = { submissionId: string; userId: string; problemId: string; createdAt: Date; verdict: string };

/** One submission per (user, problem) in scope — the best (prefer AC, else
 * most recent) so a student's five WA attempts don't each get compared. */
function pickBest(rows: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const row of rows) {
    const key = `${row.userId}:${row.problemId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingIsAc = existing.verdict === "AC";
    const rowIsAc = row.verdict === "AC";
    if (rowIsAc && !existingIsAc) byKey.set(key, row);
    else if (rowIsAc === existingIsAc && row.createdAt > existing.createdAt) byKey.set(key, row);
  }
  return [...byKey.values()];
}

async function resolveScopeCandidates(scopeType: ScopeType, scopeId: string): Promise<Candidate[]> {
  if (scopeType === "contest") {
    const rows = await prisma.submission.findMany({
      where: { contestId: scopeId, userId: { not: null } },
      select: { id: true, userId: true, problemId: true, createdAt: true, verdict: true },
    });
    return pickBest(rows.map((r) => ({ submissionId: r.id, userId: r.userId!, problemId: r.problemId, createdAt: r.createdAt, verdict: r.verdict })));
  }

  if (scopeType === "assignment") {
    const assignment = await prisma.assignment.findUnique({
      where: { id: scopeId },
      include: { problems: true, section: { include: { enrollments: true } } },
    });
    if (!assignment) return [];
    const problemIds = assignment.problems.map((p) => p.problemId);
    const userIds = assignment.section.enrollments.filter((e) => e.userId).map((e) => e.userId!);
    if (problemIds.length === 0 || userIds.length === 0) return [];
    const rows = await prisma.submission.findMany({
      where: { problemRefId: { in: problemIds }, userId: { in: userIds } },
      select: { id: true, userId: true, problemId: true, createdAt: true, verdict: true },
    });
    return pickBest(rows.map((r) => ({ submissionId: r.id, userId: r.userId!, problemId: r.problemId, createdAt: r.createdAt, verdict: r.verdict })));
  }

  if (scopeType === "section") {
    const section = await prisma.courseSection.findUnique({
      where: { id: scopeId },
      include: { enrollments: true, assignments: { include: { problems: true } } },
    });
    if (!section) return [];
    const problemIds = [...new Set(section.assignments.flatMap((a) => a.problems.map((p) => p.problemId)))];
    const userIds = section.enrollments.filter((e) => e.userId).map((e) => e.userId!);
    if (problemIds.length === 0 || userIds.length === 0) return [];
    const rows = await prisma.submission.findMany({
      where: { problemRefId: { in: problemIds }, userId: { in: userIds } },
      select: { id: true, userId: true, problemId: true, createdAt: true, verdict: true },
    });
    return pickBest(rows.map((r) => ({ submissionId: r.id, userId: r.userId!, problemId: r.problemId, createdAt: r.createdAt, verdict: r.verdict })));
  }

  return []; // "global" sweeps are per-problem, driven by findExternalMatches instead.
}

/** Recomputes positioned k-gram hashes for two submissions (cheap — only
 * called for the handful of pairs that already cleared the similarity
 * threshold) so the console can render aligned regions. */
async function computeRegions(submissionAId: string, submissionBId: string): Promise<import("./compare").Region[]> {
  const rows = await prisma.submission.findMany({
    where: { id: { in: [submissionAId, submissionBId] } },
    select: { id: true, code: true, language: true },
  });
  const a = rows.find((r) => r.id === submissionAId);
  const b = rows.find((r) => r.id === submissionBId);
  if (!a || !b) return [];
  const posA = winnow(kgramHashes(normalizeSource(a.code, a.language)));
  const posB = winnow(kgramHashes(normalizeSource(b.code, b.language)));
  return alignRegions(posA, posB);
}

type PairScore = { aId: string; bId: string; aUserId: string; bUserId: string; similarity: number; shared: number };

/** Exact Jaccard over every candidate pair sharing >= MIN_SHARED_HASHES
 * fingerprint hashes, within one problem's fingerprint set. */
function scoreCandidates(
  fingerprints: { submissionId: string; userId: string; hashes: string[] }[],
  boilerplate: Set<string>
): PairScore[] {
  const cleaned = fingerprints.map((f) => ({ ...f, hashes: excludeHashes(f.hashes, boilerplate) }));

  // hash -> submission indices, to find candidates without O(n^2) up front.
  const byHash = new Map<string, number[]>();
  cleaned.forEach((f, i) => {
    for (const h of f.hashes) {
      const arr = byHash.get(h);
      if (arr) arr.push(i);
      else byHash.set(h, [i]);
    }
  });

  const sharedCounts = new Map<string, number>();
  for (const indices of byHash.values()) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const key = `${indices[i]}:${indices[j]}`;
        sharedCounts.set(key, (sharedCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: PairScore[] = [];
  for (const [key, count] of sharedCounts) {
    if (count < MIN_SHARED_HASHES) continue;
    const [i, j] = key.split(":").map(Number);
    const a = cleaned[i];
    const b = cleaned[j];
    if (a.userId === b.userId) continue; // same student, multiple accounts aside — not plagiarism
    pairs.push({
      aId: a.submissionId,
      bId: b.submissionId,
      aUserId: a.userId,
      bUserId: b.userId,
      similarity: jaccard(a.hashes, b.hashes),
      shared: sharedCount(a.hashes, b.hashes),
    });
  }
  return pairs;
}

/** Runs the similarity sweep for one scope (D1/D2): candidate generation,
 * exact scoring, population z-score, boilerplate suppression, and
 * persistence of pairs clearing the threshold. Also searches outside the
 * scope for external matches (stored under scopeType "external"). Returns
 * the number of pairs persisted. */
export async function runIntegritySweep(scopeType: ScopeType, scopeId: string): Promise<number> {
  const candidates = await resolveScopeCandidates(scopeType, scopeId);
  if (candidates.length === 0) return 0;

  const byProblem = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const arr = byProblem.get(c.problemId);
    if (arr) arr.push(c);
    else byProblem.set(c.problemId, [c]);
  }

  let persisted = 0;
  for (const [problemId, group] of byProblem) {
    if (group.length < 2) continue;

    const fingerprints = await prisma.submissionFingerprint.findMany({
      where: { submissionId: { in: group.map((g) => g.submissionId) } },
      select: { submissionId: true, hashes: true },
    });
    if (fingerprints.length < 2) continue;

    const userBySubmission = new Map(group.map((g) => [g.submissionId, g.userId]));
    const withUser = fingerprints.map((f) => ({ ...f, userId: userBySubmission.get(f.submissionId)! }));
    const boilerplate = boilerplateHashes(withUser.map((f) => f.hashes));
    const pairs = scoreCandidates(withUser, boilerplate);
    if (pairs.length === 0) continue;

    const population = pairs.map((p) => p.similarity);

    for (const pair of pairs) {
      const z = zScore(pair.similarity, population);
      if (z < PERSIST_Z_THRESHOLD && pair.similarity < PERSIST_SIMILARITY_THRESHOLD) continue;

      const regions = await computeRegions(pair.aId, pair.bId).catch(() => []);
      try {
        await prisma.similarityPair.upsert({
          where: {
            scopeType_scopeId_submissionAId_submissionBId: {
              scopeType,
              scopeId,
              submissionAId: pair.aId,
              submissionBId: pair.bId,
            },
          },
          create: {
            scopeType,
            scopeId,
            problemId,
            submissionAId: pair.aId,
            submissionBId: pair.bId,
            userAId: pair.aUserId,
            userBId: pair.bUserId,
            similarity: pair.similarity,
            zScore: z,
            sharedTokens: pair.shared,
            regions: regions as never,
          },
          update: { similarity: pair.similarity, zScore: z, sharedTokens: pair.shared, regions: regions as never },
        });
        persisted++;
      } catch (err) {
        log.error("failed to persist similarity pair", { scopeType, scopeId, problemId }, err);
      }
    }

    await findExternalMatches(scopeType, scopeId, problemId, group).catch((err) =>
      log.warn("external match search failed", { scopeType, scopeId, problemId, error: err instanceof Error ? err.message : String(err) })
    );
  }

  return persisted;
}

/**
 * Scope-expansion search (D1's "free once the index exists"): for each
 * in-scope submission, look up the inverted index for the *same problem*
 * outside this scope's own submission set — earlier semesters, other
 * sections, the public archive.
 */
async function findExternalMatches(
  scopeType: ScopeType,
  scopeId: string,
  problemId: string,
  group: Candidate[]
): Promise<void> {
  const inScopeIds = new Set(group.map((g) => g.submissionId));
  const fingerprints = await prisma.submissionFingerprint.findMany({
    where: { submissionId: { in: [...inScopeIds] } },
    select: { submissionId: true, hashes: true },
  });
  const userBySubmission = new Map(group.map((g) => [g.submissionId, g.userId]));

  for (const fp of fingerprints) {
    if (fp.hashes.length === 0) continue;
    const indexRows = await prisma.fingerprintIndex.findMany({
      where: { problemId, hash: { in: fp.hashes }, submissionId: { notIn: [...inScopeIds] } },
      select: { hash: true, submissionId: true },
    });
    if (indexRows.length === 0) continue;

    const countBySubmission = new Map<string, number>();
    for (const row of indexRows) countBySubmission.set(row.submissionId, (countBySubmission.get(row.submissionId) ?? 0) + 1);

    for (const [externalId, count] of countBySubmission) {
      if (count < MIN_SHARED_HASHES) continue;
      const external = await prisma.submissionFingerprint.findUnique({
        where: { submissionId: externalId },
        select: { hashes: true, submission: { select: { userId: true } } },
      });
      if (!external?.submission.userId) continue;

      const similarity = jaccard(fp.hashes, external.hashes);
      if (similarity < PERSIST_SIMILARITY_THRESHOLD) continue;

      const regions = await computeRegions(fp.submissionId, externalId).catch(() => []);
      await prisma.similarityPair
        .upsert({
          where: {
            scopeType_scopeId_submissionAId_submissionBId: {
              scopeType: "external",
              scopeId: `${scopeType}:${scopeId}`,
              submissionAId: fp.submissionId,
              submissionBId: externalId,
            },
          },
          create: {
            scopeType: "external",
            scopeId: `${scopeType}:${scopeId}`,
            problemId,
            submissionAId: fp.submissionId,
            submissionBId: externalId,
            userAId: userBySubmission.get(fp.submissionId)!,
            userBId: external.submission.userId,
            similarity,
            zScore: 0,
            sharedTokens: count,
            regions: regions as never,
          },
          update: { similarity, sharedTokens: count, regions: regions as never },
        })
        .catch((err) => log.error("failed to persist external match", { problemId }, err));
    }
  }
}
