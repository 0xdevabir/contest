import { describe, expect, it, beforeEach } from "vitest";
import { hasTestDb } from "../../tests/setup";

const CORRECT_SUM_C = `#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}`;

const WRONG_SUM_C = `#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b+1);return 0;}`;

describe.skipIf(!hasTestDb)("problem-authoring", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let authorId: string;

  beforeEach(async () => {
    ({ prisma } = await import("@/lib/db"));
    const user = await prisma.user.create({
      data: {
        email: `setter-${Date.now()}-${Math.random()}@example.test`,
        passwordHash: "x",
        name: "Setter",
        role: "TEACHER",
      },
    });
    authorId = user.id;
  });

  async function makeProblem(slug: string) {
    const { createProblem } = await import("@/lib/problem-authoring");
    return createProblem(authorId, null, {
      title: "Sum two numbers",
      slug,
      difficulty: "EASY",
      visibility: "PUBLIC",
      statementMd: "Given $a$ and $b$, print $a+b$.",
    });
  }

  it("throws ConflictError when editing a frozen version", async () => {
    const { assertVersionEditable, publishVersion } = await import("@/lib/problem-authoring");
    const { ConflictError } = await import("@/lib/errors");
    const problem = await makeProblem("freeze-rule-test");
    const versionId = problem.versions[0].id;

    const mainGroup = await prisma.testGroup.findFirstOrThrow({ where: { problemVersionId: versionId, isSample: false } });
    await prisma.testCase.create({
      data: { testGroupId: mainGroup.id, order: 0, label: "1", inputInline: "2 3\n", expectedInline: "5\n", inputHash: "h1", expectedHash: "h2", inputBytes: 4, expectedBytes: 2 },
    });
    await prisma.referenceSolution.create({
      data: { problemVersionId: versionId, language: "c", source: CORRECT_SUM_C, expectedVerdict: "AC" },
    });

    await publishVersion(problem.id, versionId, { force: true });

    await expect(assertVersionEditable(versionId)).rejects.toBeInstanceOf(ConflictError);
  });

  it("forkVersion creates version n+1 as an editable deep copy", async () => {
    const { forkVersion, publishVersion } = await import("@/lib/problem-authoring");
    const problem = await makeProblem("fork-test");
    const versionId = problem.versions[0].id;

    const mainGroup = await prisma.testGroup.findFirstOrThrow({ where: { problemVersionId: versionId, isSample: false } });
    await prisma.testCase.create({
      data: { testGroupId: mainGroup.id, order: 0, label: "1", inputInline: "2 3\n", expectedInline: "5\n", inputHash: "h1", expectedHash: "h2", inputBytes: 4, expectedBytes: 2 },
    });
    await prisma.referenceSolution.create({
      data: { problemVersionId: versionId, language: "c", source: CORRECT_SUM_C, expectedVerdict: "AC" },
    });
    await publishVersion(problem.id, versionId, { force: true });

    const forked = await forkVersion(problem.id, authorId);
    expect(forked.version).toBe(2);
    expect(forked.frozen).toBe(false);

    const forkedGroups = await prisma.testGroup.findMany({ where: { problemVersionId: forked.id }, include: { cases: true } });
    const forkedMain = forkedGroups.find((g) => !g.isSample)!;
    expect(forkedMain.cases).toHaveLength(1);
    expect(forkedMain.cases[0].inputInline).toBe("2 3\n");

    const forkedRefs = await prisma.referenceSolution.findMany({ where: { problemVersionId: forked.id } });
    expect(forkedRefs).toHaveLength(1);
  });

  it("publish gate passes when a reference solution actually judges AC", async () => {
    const { runPublishGate } = await import("@/lib/problem-authoring");
    const problem = await makeProblem("gate-pass-test");
    const versionId = problem.versions[0].id;

    const mainGroup = await prisma.testGroup.findFirstOrThrow({ where: { problemVersionId: versionId, isSample: false } });
    await prisma.testCase.create({
      data: { testGroupId: mainGroup.id, order: 0, label: "1", inputInline: "2 3\n", expectedInline: "5\n", inputHash: "h1", expectedHash: "h2", inputBytes: 4, expectedBytes: 2 },
    });
    await prisma.referenceSolution.create({
      data: { problemVersionId: versionId, language: "c", source: CORRECT_SUM_C, expectedVerdict: "AC" },
    });

    const gate = await runPublishGate(versionId);
    expect(gate.passed).toBe(true);
    expect(gate.hasPassingAcReference).toBe(true);
    expect(gate.blockers).toHaveLength(0);
  });

  it("publish gate fails and blocks publish when the reference solution's verdict doesn't match", async () => {
    const { runPublishGate, publishVersion } = await import("@/lib/problem-authoring");
    const problem = await makeProblem("gate-fail-test");
    const versionId = problem.versions[0].id;

    const mainGroup = await prisma.testGroup.findFirstOrThrow({ where: { problemVersionId: versionId, isSample: false } });
    await prisma.testCase.create({
      data: { testGroupId: mainGroup.id, order: 0, label: "1", inputInline: "2 3\n", expectedInline: "5\n", inputHash: "h1", expectedHash: "h2", inputBytes: 4, expectedBytes: 2 },
    });
    await prisma.referenceSolution.create({
      data: { problemVersionId: versionId, language: "c", source: WRONG_SUM_C, expectedVerdict: "AC" },
    });

    const gate = await runPublishGate(versionId);
    expect(gate.passed).toBe(false);
    expect(gate.blockers.length).toBeGreaterThan(0);

    const publishResult = await publishVersion(problem.id, versionId);
    expect(publishResult.gate.passed).toBe(false);
    const updated = await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } });
    expect(updated.status).not.toBe("PUBLISHED");
  });

  it("publish gate blocks a version with no tests or no reference solutions", async () => {
    const { runPublishGate } = await import("@/lib/problem-authoring");
    const problem = await makeProblem("gate-empty-test");
    const versionId = problem.versions[0].id;

    const gate = await runPublishGate(versionId);
    expect(gate.passed).toBe(false);
    expect(gate.blockers).toContain("This version has no test cases.");
    expect(gate.blockers).toContain("Add at least one reference solution.");
  });
});
