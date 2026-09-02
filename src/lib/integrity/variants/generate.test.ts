import { execSync } from "node:child_process";
import { describe, it, expect, beforeEach } from "vitest";
import { hasTestDb } from "../../../../tests/setup";

function hasLocalCompiler(): boolean {
  const bin = process.platform === "darwin" ? "clang" : "gcc";
  try {
    execSync(`${bin} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const GENERATOR_SOURCE = `
#include <stdio.h>
int main() { printf("3 4\\n"); return 0; }
`;

const REFERENCE_SOURCE = `
#include <stdio.h>
int main() { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); return 0; }
`;

/**
 * D3 — a variant's expected output must match running the reference
 * solution against that variant's *own* generated input (the D3 acceptance
 * test), determinism (same seed -> same params), and distinctness across
 * users. Exercises the real judge sandbox's local-compiler path (see
 * judge.test.ts) against a real Postgres instance — skipped without either.
 */
describe.skipIf(!hasTestDb || !hasLocalCompiler())("generateVariant", () => {
  let prisma: typeof import("@/lib/db").prisma;

  beforeEach(async () => {
    ({ prisma } = await import("@/lib/db"));
  });

  async function makeTemplate() {
    const author = await prisma.user.create({
      data: { email: `variant-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", name: "Variant Author" },
    });
    const problem = await prisma.problem.create({
      data: {
        slug: `variant-fixture-${Date.now()}-${Math.random()}`,
        title: "Variant Fixture",
        authorId: author.id,
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
    });
    const version = await prisma.problemVersion.create({
      data: {
        problemId: problem.id,
        version: 1,
        statementMd: "Add two numbers.",
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        maxScore: 100,
        createdById: author.id,
        publishedAt: new Date(),
      },
    });
    await prisma.problem.update({ where: { id: problem.id }, data: { currentVersionId: version.id } });

    const template = await prisma.problemVariantTemplate.create({
      data: {
        problemId: problem.id,
        statementTemplate: "Add two fixed numbers.",
        parameterSpec: [{ name: "n", kind: "int-range", min: 5, max: 9 }] as never,
        generatorSource: GENERATOR_SOURCE,
        generatorLang: "c",
        referenceSource: REFERENCE_SOURCE,
        referenceLang: "c",
        createdById: author.id,
      },
    });
    return { author, problem, template };
  }

  it("stores a variant whose expected output matches the reference re-run on its own input", async () => {
    const { generateVariant } = await import("./generate");
    const { template } = await makeTemplate();
    const student = await prisma.user.create({
      data: { email: `variant-student-${Date.now()}@example.com`, passwordHash: "x", name: "Variant Student" },
    });

    const { problemVersionId } = await generateVariant({
      templateId: template.id,
      userId: student.id,
      scopeType: "assignment",
      scopeId: "scope-1",
    });

    const version = await prisma.problemVersion.findUniqueOrThrow({
      where: { id: problemVersionId },
      include: { groups: { include: { cases: true } } },
    });
    const testCase = version.groups[0].cases[0];
    expect(testCase.inputInline).toBe("3 4\n");
    expect(testCase.expectedInline).toBe("7\n");

    const { runCustomV2 } = await import("../../judge/index");
    const rerun = await runCustomV2({
      submissionId: "generate-test-rerun",
      language: "c",
      source: REFERENCE_SOURCE,
      stdin: testCase.inputInline!,
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    });
    expect(rerun.tests?.[0]?.stdout).toBe(testCase.expectedInline);
  });

  it("is deterministic (same template/user/scope) and distinct across users", async () => {
    const { generateVariant } = await import("./generate");
    const { template } = await makeTemplate();
    const userA = await prisma.user.create({
      data: { email: `variant-a-${Date.now()}@example.com`, passwordHash: "x", name: "Variant A" },
    });
    const userB = await prisma.user.create({
      data: { email: `variant-b-${Date.now()}@example.com`, passwordHash: "x", name: "Variant B" },
    });

    const first = await generateVariant({ templateId: template.id, userId: userA.id, scopeType: "assignment", scopeId: "scope-1" });
    const again = await generateVariant({ templateId: template.id, userId: userA.id, scopeType: "assignment", scopeId: "scope-1" });
    expect(again.problemVersionId).toBe(first.problemVersionId);
    expect(again.parameters).toEqual(first.parameters);

    const forUserB = await generateVariant({ templateId: template.id, userId: userB.id, scopeType: "assignment", scopeId: "scope-1" });
    expect(forUserB.problemVersionId).not.toBe(first.problemVersionId);
  });
});
