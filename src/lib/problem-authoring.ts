import type { CheckerType, Prisma, Verdict } from "@prisma/client";
import { prisma } from "./db";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { compileAndJudge } from "./judge";
import type { TestCase as JudgeTestCase } from "./types";
import { getBlobStore } from "./blob";
import { labelToPrismaDifficulty } from "./difficulty";
import type { Difficulty } from "./types";
import type { SessionUser } from "./auth";
import { assertCan } from "./authz";

/**
 * Shared ownership gate for every /api/teacher/problems/[id]/** route: loads
 * the problem and throws NotFoundError/ForbiddenError via assertCan before
 * the route touches anything version/test/reference-shaped underneath it.
 */
export async function requireOwnedProblem(problemId: string, actor: SessionUser) {
  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) throw new NotFoundError("Problem not found");
  assertCan(actor, "problem:edit", { ownerId: problem.authorId });
  return problem;
}

/** Same gate, plus confirms the version actually belongs to this problem —
 * used by every /versions/[vid]/** route so a teacher can't act on a
 * version id that belongs to someone else's problem. */
export async function requireOwnedVersion(problemId: string, versionId: string, actor: SessionUser) {
  const problem = await requireOwnedProblem(problemId, actor);
  const version = await prisma.problemVersion.findUnique({ where: { id: versionId } });
  if (!version || version.problemId !== problem.id) throw new NotFoundError("Problem version not found");
  return { problem, version };
}

export type CreateProblemInput = {
  title: string;
  slug: string;
  difficulty: Difficulty;
  visibility: "PUBLIC" | "INSTITUTION" | "PRIVATE";
  statementMd: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
};

/** Creates the Problem identity row plus its v1 draft ProblemVersion. */
export async function createProblem(authorId: string, institutionId: string | null, input: CreateProblemInput) {
  const existing = await prisma.problem.findUnique({ where: { slug: input.slug } });
  if (existing) throw new ValidationError("A problem with this slug already exists.");

  return prisma.problem.create({
    data: {
      slug: input.slug,
      title: input.title,
      status: "DRAFT",
      visibility: input.visibility,
      authorId,
      institutionId,
      difficulty: labelToPrismaDifficulty(input.difficulty),
      versions: {
        create: {
          version: 1,
          frozen: false,
          statementMd: input.statementMd,
          timeLimitMs: input.timeLimitMs ?? 2000,
          memoryLimitMb: input.memoryLimitMb ?? 256,
          createdById: authorId,
          groups: {
            create: [
              { order: 0, name: "samples", points: 0, isSample: true },
              { order: 1, name: "main", points: 100 },
            ],
          },
        },
      },
    },
    include: { versions: true },
  });
}

async function requireVersion(versionId: string) {
  const version = await prisma.problemVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new NotFoundError("Problem version not found");
  return version;
}

/** Editing a frozen (published or contest-referenced) version is a bug in the
 * caller, not a race — always surfaced as a 409 so the UI can offer "fork". */
export async function assertVersionEditable(versionId: string) {
  const version = await requireVersion(versionId);
  if (version.frozen) {
    throw new ConflictError("This version is frozen. Fork it into a new draft to make changes.");
  }
  return version;
}

export async function updateVersionContent(
  versionId: string,
  patch: Partial<{
    statementMd: string;
    statementBn: string | null;
    inputSpec: string;
    outputSpec: string;
    constraints: string;
    notes: string;
    starterCode: Prisma.InputJsonValue;
    timeLimitMs: number;
    memoryLimitMb: number;
    outputLimitKb: number;
    checkerType: CheckerType;
    checkerEps: number | null;
    checkerCode: string | null;
    checkerLang: string | null;
  }>
) {
  await assertVersionEditable(versionId);
  return prisma.problemVersion.update({ where: { id: versionId }, data: patch });
}

export async function updateProblemMeta(
  problemId: string,
  patch: Partial<{ title: string; visibility: "PUBLIC" | "INSTITUTION" | "PRIVATE"; difficulty: Difficulty }>
) {
  const data: Prisma.ProblemUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.visibility !== undefined) data.visibility = patch.visibility;
  if (patch.difficulty !== undefined) data.difficulty = labelToPrismaDifficulty(patch.difficulty);
  return prisma.problem.update({ where: { id: problemId }, data });
}

/**
 * Forks the problem's *current published* version into a fresh mutable
 * draft (n+1) — groups/cases/references are deep-copied so editing the new
 * draft never touches the frozen version a contest may still be pinned to.
 */
export async function forkVersion(problemId: string, createdById: string) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { groups: { include: { cases: true } }, references: true },
      },
    },
  });
  if (!problem) throw new NotFoundError("Problem not found");
  const source = problem.versions[0];
  if (!source) throw new NotFoundError("No version to fork from");

  const nextVersion = source.version + 1;

  return prisma.problemVersion.create({
    data: {
      problemId,
      version: nextVersion,
      frozen: false,
      statementMd: source.statementMd,
      statementBn: source.statementBn,
      inputSpec: source.inputSpec,
      outputSpec: source.outputSpec,
      constraints: source.constraints,
      notes: source.notes,
      starterCode: source.starterCode as Prisma.InputJsonValue,
      timeLimitMs: source.timeLimitMs,
      memoryLimitMb: source.memoryLimitMb,
      outputLimitKb: source.outputLimitKb,
      checkerType: source.checkerType,
      checkerEps: source.checkerEps,
      checkerCode: source.checkerCode,
      checkerLang: source.checkerLang,
      maxScore: source.maxScore,
      createdById,
      groups: {
        create: source.groups.map((g) => ({
          order: g.order,
          name: g.name,
          points: g.points,
          isSample: g.isSample,
          dependsOn: g.dependsOn,
          stopOnFail: g.stopOnFail,
          cases: {
            create: g.cases.map((c) => ({
              order: c.order,
              label: c.label,
              inputKey: c.inputKey,
              expectedKey: c.expectedKey,
              inputInline: c.inputInline,
              expectedInline: c.expectedInline,
              inputHash: c.inputHash,
              expectedHash: c.expectedHash,
              inputBytes: c.inputBytes,
              expectedBytes: c.expectedBytes,
              manualExpected: c.manualExpected,
            })),
          },
        })),
      },
      references: {
        create: source.references.map((r) => ({
          language: r.language,
          source: r.source,
          expectedVerdict: r.expectedVerdict,
          note: r.note,
        })),
      },
    },
  });
}

/** Resolves every TestCase's content (inline or blob) into judge.ts's shape. */
export async function getVersionTestCases(
  versionId: string
): Promise<{ tests: JudgeTestCase[]; timeLimitMs: number; groupCount: number }> {
  const version = await prisma.problemVersion.findUnique({
    where: { id: versionId },
    include: { groups: { orderBy: { order: "asc" }, include: { cases: { orderBy: { order: "asc" } } } } },
  });
  if (!version) throw new NotFoundError("Problem version not found");

  const store = getBlobStore();
  const tests: JudgeTestCase[] = [];
  for (const group of version.groups) {
    for (const testCase of group.cases) {
      const input = testCase.inputInline ?? (testCase.inputKey ? (await store.get(testCase.inputKey)).toString("utf8") : "");
      const output = testCase.expectedInline ?? (testCase.expectedKey ? (await store.get(testCase.expectedKey)).toString("utf8") : "");
      tests.push({ input, output, sample: group.isSample });
    }
  }
  return { tests, timeLimitMs: version.timeLimitMs, groupCount: version.groups.length };
}

export type PublishGateTestResult = {
  referenceSolutionId: string;
  language: string;
  expectedVerdict: Verdict;
  actualVerdict: string;
  passed: boolean;
  message?: string;
};

export type PublishGateResult = {
  passed: boolean;
  hasTests: boolean;
  hasPassingAcReference: boolean;
  results: PublishGateTestResult[];
  blockers: string[];
};

/**
 * D6's publish gate: at least one AC-expected reference solution must
 * actually judge AC against every test, and every declared expectedVerdict
 * must match reality. Runs against the existing C judge (judge.ts) — only
 * `language: "c"` reference solutions are executable until Phase 3
 * generalises the judge; anything else is reported as a blocker rather than
 * silently skipped, so a non-C reference can't slip a problem through
 * unverified.
 */
export async function runPublishGate(versionId: string): Promise<PublishGateResult> {
  const version = await prisma.problemVersion.findUnique({
    where: { id: versionId },
    include: { references: true },
  });
  if (!version) throw new NotFoundError("Problem version not found");

  const { tests } = await getVersionTestCases(versionId);
  const blockers: string[] = [];

  if (tests.length === 0) {
    blockers.push("This version has no test cases.");
  }
  if (version.references.length === 0) {
    blockers.push("Add at least one reference solution.");
  }

  const results: PublishGateTestResult[] = [];
  let hasPassingAcReference = false;

  for (const ref of version.references) {
    if (ref.language !== "c") {
      results.push({
        referenceSolutionId: ref.id,
        language: ref.language,
        expectedVerdict: ref.expectedVerdict,
        actualVerdict: "UNVERIFIED",
        passed: false,
        message: `Automatic verification only supports C reference solutions right now (got "${ref.language}").`,
      });
      continue;
    }

    if (tests.length === 0) {
      results.push({
        referenceSolutionId: ref.id,
        language: ref.language,
        expectedVerdict: ref.expectedVerdict,
        actualVerdict: "SKIP",
        passed: false,
        message: "No tests to judge against.",
      });
      continue;
    }

    const judged = await compileAndJudge({ code: ref.source, tests, timeLimitMs: version.timeLimitMs });
    const passed = judged.verdict === ref.expectedVerdict;
    if (ref.expectedVerdict === "AC" && judged.verdict === "AC") hasPassingAcReference = true;

    results.push({
      referenceSolutionId: ref.id,
      language: ref.language,
      expectedVerdict: ref.expectedVerdict,
      actualVerdict: judged.verdict,
      passed,
      message: passed
        ? undefined
        : judged.compileStderr || judged.message || `Expected ${ref.expectedVerdict}, got ${judged.verdict}.`,
    });

    await prisma.referenceSolution.update({
      where: { id: ref.id },
      data: { lastVerdict: judged.verdict, lastCheckedAt: new Date() },
    });
  }

  if (version.references.length > 0 && !hasPassingAcReference) {
    blockers.push("No reference solution with expectedVerdict AC actually judges as AC.");
  }
  const anyMismatch = results.some((r) => !r.passed);
  if (anyMismatch) blockers.push("One or more reference solutions did not produce their declared verdict.");

  return {
    passed: blockers.length === 0,
    hasTests: tests.length > 0,
    hasPassingAcReference,
    results,
    blockers,
  };
}

/**
 * Publishes a version: freezes it, points Problem.currentVersionId at it,
 * flips Problem.status to PUBLISHED. `force` bypasses a failing/unverifiable
 * gate and is the caller's responsibility to restrict to admins (the
 * "publish anyway" escape hatch from the spec's frontend surface table).
 */
export async function publishVersion(
  problemId: string,
  versionId: string,
  opts: { force?: boolean } = {}
): Promise<{ gate: PublishGateResult }> {
  const version = await requireVersion(versionId);
  if (version.problemId !== problemId) throw new ValidationError("Version does not belong to this problem.");

  const gate = await runPublishGate(versionId);
  if (!gate.passed && !opts.force) {
    return { gate };
  }

  await prisma.$transaction([
    prisma.problemVersion.update({
      where: { id: versionId },
      data: { frozen: true, publishedAt: new Date() },
    }),
    prisma.problem.update({
      where: { id: problemId },
      data: { status: "PUBLISHED", currentVersionId: versionId },
    }),
  ]);

  return { gate };
}

export async function submitForReview(problemId: string) {
  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) throw new NotFoundError("Problem not found");
  if (problem.status !== "DRAFT") {
    throw new ConflictError("Only a DRAFT problem can be submitted for review.");
  }
  return prisma.problem.update({ where: { id: problemId }, data: { status: "IN_REVIEW" } });
}

export async function reviewProblem(problemId: string, decision: "approve" | "reject") {
  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) throw new NotFoundError("Problem not found");
  if (problem.status !== "IN_REVIEW") {
    throw new ConflictError("Only an IN_REVIEW problem can be reviewed.");
  }
  // `decision` only affects what the caller records in the admin audit log
  // (approve vs. reject reason) — both outcomes return the problem to DRAFT
  // here; see the comment below for why.
  void decision;
  // Approval hands the problem back to the author as a DRAFT ready to
  // publish (review approves the *content*; publish is the separate,
  // gate-checked step that actually makes it live) — rejection does the same
  // so the author can address feedback and resubmit.
  return prisma.problem.update({ where: { id: problemId }, data: { status: "DRAFT" } });
}

