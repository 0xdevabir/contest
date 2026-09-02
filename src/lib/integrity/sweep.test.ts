import { describe, it, expect, beforeEach } from "vitest";
import { hasTestDb } from "../../../tests/setup";

/**
 * D1/D2 integration coverage against a real Postgres instance — skipped
 * without one (see tests/setup.ts). Exercises `runIntegritySweep` end to
 * end: fingerprint -> candidate generation -> z-score -> persistence,
 * including the false-positive fixture the phase doc calls out as the test
 * most likely to be skipped.
 */
describe.skipIf(!hasTestDb)("runIntegritySweep", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let fingerprintSubmission: typeof import("./fingerprint").fingerprintSubmission;
  let runIntegritySweep: typeof import("./sweep").runIntegritySweep;

  beforeEach(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ fingerprintSubmission } = await import("./fingerprint"));
    ({ runIntegritySweep } = await import("./sweep"));
  });

  async function makeUser(label: string) {
    return prisma.user.create({
      data: { email: `sweep-${label}-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", name: label },
    });
  }

  async function makeContest(createdById: string) {
    return prisma.contest.create({
      data: { slug: `sweep-contest-${Date.now()}-${Math.random()}`, title: "Sweep Fixture", createdById },
    });
  }

  async function makeSubmission(opts: { userId: string; contestId: string | null; problemId: string; code: string }) {
    const submission = await prisma.submission.create({
      data: {
        userId: opts.userId,
        contestId: opts.contestId,
        problemId: opts.problemId,
        code: opts.code,
        verdict: "AC",
      },
    });
    await fingerprintSubmission({ submissionId: submission.id, problemId: opts.problemId, code: opts.code, language: "c" });
    return submission;
  }

  /** A different constant/operator sequence per `seed`, long enough to clear
   * the fingerprinting floor (40 tokens) and the winnowing window (64). */
  function makeIndependentProgram(seed: number, lines = 24): string {
    const ops = ["+", "-", "*"];
    let body = "";
    for (let i = 0; i < lines; i++) {
      const num = seed * 100000 + i * 37 + 11;
      const op = ops[(seed + i) % ops.length];
      body += `  r = r ${op} ${num};\n`;
    }
    return `int main(){ int r = 0;\n${body}  printf("%d", r); return 0; }`;
  }

  it("ranks a near-duplicate pair (renamed identifiers, reformatted) at the top", async () => {
    const author = await makeUser("dup-author");
    const contest = await makeContest(author.id);
    const problemId = "dup-problem";

    const original = makeIndependentProgram(1);
    // Same structure, different variable name + spacing — normalizes identically.
    const renamed = original.replace(/\br\b/g, "total").replace(/\n {2}/g, "\n    ");

    const userA = await makeUser("dup-a");
    const userB = await makeUser("dup-b");
    const subA = await makeSubmission({ userId: userA.id, contestId: contest.id, problemId, code: original });
    const subB = await makeSubmission({ userId: userB.id, contestId: contest.id, problemId, code: renamed });

    // A large-enough population that a hash shared by only the duplicate
    // pair stays well under boilerplateHashes' 20%-of-population threshold
    // (D2) — too small a population and the pair's own shared hashes get
    // mistaken for boilerplate and excluded before scoring.
    for (let i = 2; i <= 14; i++) {
      const u = await makeUser(`dup-pop-${i}`);
      await makeSubmission({ userId: u.id, contestId: contest.id, problemId, code: makeIndependentProgram(i) });
    }

    await runIntegritySweep("contest", contest.id);

    const pairs = await prisma.similarityPair.findMany({
      where: { scopeType: "contest", scopeId: contest.id, problemId },
      orderBy: { zScore: "desc" },
    });
    expect(pairs.length).toBeGreaterThan(0);
    const top = pairs[0];
    expect(top.similarity).toBeGreaterThanOrEqual(0.9);
    expect(new Set([top.submissionAId, top.submissionBId])).toEqual(new Set([subA.id, subB.id]));
  });

  it("flags zero pairs for 20 genuinely independent solutions", async () => {
    const author = await makeUser("indep-author");
    const contest = await makeContest(author.id);
    const problemId = "indep-problem";

    for (let i = 0; i < 20; i++) {
      const u = await makeUser(`indep-${i}`);
      await makeSubmission({ userId: u.id, contestId: contest.id, problemId, code: makeIndependentProgram(i) });
    }

    await runIntegritySweep("contest", contest.id);

    const pairs = await prisma.similarityPair.findMany({
      where: { scopeType: "contest", scopeId: contest.id, problemId },
    });
    expect(pairs).toHaveLength(0);
  });

  it("suppresses a trivially-similar easy-problem pair despite high raw overlap", async () => {
    const author = await makeUser("easy-author");
    const contest = await makeContest(author.id);
    const problemId = "easy-problem";

    // Shared boilerplate every "student" writes for this trivial problem —
    // long enough to clear the token floor, identical across everyone, so
    // boilerplateHashes() (D2) excludes it before scoring.
    const boilerplate = Array.from(
      { length: 30 },
      (_, i) => `  int fastio_${i} = ${i}; fastio_${i} = fastio_${i} + 1;`
    ).join("\n");

    for (let i = 0; i < 6; i++) {
      const u = await makeUser(`easy-${i}`);
      // A single, per-student differing tail — not enough left over, once
      // the shared boilerplate is excluded, to look like a real match.
      const code = `int main(){\n${boilerplate}\n  int a=${i}, b=${i + 1};\n  printf("%d", a + b);\n  return 0; }`;
      await makeSubmission({ userId: u.id, contestId: contest.id, problemId, code });
    }

    await runIntegritySweep("contest", contest.id);

    const pairs = await prisma.similarityPair.findMany({
      where: { scopeType: "contest", scopeId: contest.id, problemId },
    });
    expect(pairs).toHaveLength(0);
  });

  it("finds a cross-scope external match outside the swept contest", async () => {
    const author = await makeUser("ext-author");
    const contest = await makeContest(author.id);
    const problemId = "ext-problem";

    const original = makeIndependentProgram(50);
    const renamed = original.replace(/\br\b/g, "acc").replace(/\n {2}/g, "\n    ");

    const inScopeUser = await makeUser("ext-inscope");
    const inScope = await makeSubmission({ userId: inScopeUser.id, contestId: contest.id, problemId, code: original });

    // `runIntegritySweep` only calls `findExternalMatches` for a problemId
    // whose in-scope group both has >= 2 submissions AND clears its own
    // local `scoreCandidates` (`pairs.length === 0` short-circuits before
    // the external search runs) — a second in-scope near-duplicate clears
    // both bars. A large-enough population (as in the ranking test above)
    // keeps that in-scope pair's shared hashes under boilerplateHashes'
    // 20%-of-population threshold so they survive to scoring.
    const inScopeDupUser = await makeUser("ext-inscope-dup");
    await makeSubmission({
      userId: inScopeDupUser.id,
      contestId: contest.id,
      problemId,
      code: original.replace(/\br\b/g, "total").replace(/\n {2}/g, "\n    "),
    });
    for (let i = 52; i <= 64; i++) {
      const u = await makeUser(`ext-inscope-pop-${i}`);
      await makeSubmission({ userId: u.id, contestId: contest.id, problemId, code: makeIndependentProgram(i) });
    }

    // Outside this contest entirely (no contestId) — same problem, near-identical code.
    const externalUser = await makeUser("ext-outside");
    const external = await makeSubmission({ userId: externalUser.id, contestId: null, problemId, code: renamed });

    await runIntegritySweep("contest", contest.id);

    const externalPairs = await prisma.similarityPair.findMany({
      where: { scopeType: "external", scopeId: `contest:${contest.id}`, problemId },
    });
    expect(externalPairs.length).toBeGreaterThan(0);
    // submissionA is always the in-scope side (findExternalMatches iterates
    // in-scope fingerprints as `fp`); submissionB is the external match.
    const matched = externalPairs.find((p) => p.submissionBId === external.id);
    expect(matched).toBeDefined();
    expect(matched!.submissionAId).toBe(inScope.id);
    expect(matched!.similarity).toBeGreaterThanOrEqual(0.9);
  });
});
