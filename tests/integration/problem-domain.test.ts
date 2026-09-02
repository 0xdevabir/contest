import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasTestDb } from "../setup";
import type { SessionUser } from "@/lib/auth";

/**
 * End-to-end Problem Domain flow through the real route handlers and a real
 * Prisma test DB (skipped without one — see tests/setup.ts): create a
 * problem as a teacher, add a test group's cases, add a reference solution,
 * validate, publish, and confirm it surfaces in the public archive — plus
 * the two hard invariants the phase spec calls out by name: hidden test
 * bodies never leak in a serialized response, and every pre-existing legacy
 * bank URL/submission keeps working after the DB-backed bank takes over.
 */

let mockSession: SessionUser | null = null;
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => mockSession),
}));

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const CORRECT_SUM_C = `#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}`;

beforeEach(() => {
  mockSession = null;
});

describe.skipIf(!hasTestDb)("Problem Domain authoring flow", () => {
  it("create -> add tests -> add reference -> validate -> publish -> visible in archive", async () => {
    const { prisma } = await import("@/lib/db");
    const teacher = await prisma.user.create({
      data: {
        email: `flow-teacher-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "Flow Teacher",
        role: "TEACHER",
      },
    });
    mockSession = { id: teacher.id, role: "TEACHER", institutionId: null } as SessionUser;

    const { POST: createProblem } = await import("@/app/api/teacher/problems/route");
    const createRes = await createProblem(
      jsonReq("/api/teacher/problems", "POST", {
        title: "Two Sum Flow",
        slug: `two-sum-flow-${Date.now()}`,
        difficulty: "EASY",
        visibility: "PUBLIC",
        statementMd: "Given $a$ and $b$, print $a+b$.",
      })
    );
    const createData = await createRes.json();
    expect(createData.ok).toBe(true);
    const problemId: string = createData.problem.id;
    const versionId: string = createData.problem.versions[0].id;

    const mainGroup = await prisma.testGroup.findFirstOrThrow({ where: { problemVersionId: versionId, isSample: false } });
    const sampleGroup = await prisma.testGroup.findFirstOrThrow({ where: { problemVersionId: versionId, isSample: true } });

    const { POST: addTests } = await import("@/app/api/teacher/problems/[id]/versions/[vid]/tests/route");
    const addTestsRes = await addTests(
      jsonReq(`/api/teacher/problems/${problemId}/versions/${versionId}/tests`, "POST", {
        rows: [
          { groupId: sampleGroup.id, input: "2 3", expected: "5" },
          { groupId: mainGroup.id, input: "10 20", expected: "30" },
        ],
      }),
      { params: Promise.resolve({ id: problemId, vid: versionId }) }
    );
    const addTestsData = await addTestsRes.json();
    expect(addTestsData.ok).toBe(true);
    expect(addTestsData.created).toBe(2);

    const { POST: addReference } = await import("@/app/api/teacher/problems/[id]/versions/[vid]/references/route");
    const addRefRes = await addReference(
      jsonReq(`/api/teacher/problems/${problemId}/versions/${versionId}/references`, "POST", {
        language: "c",
        source: CORRECT_SUM_C,
        expectedVerdict: "AC",
      }),
      { params: Promise.resolve({ id: problemId, vid: versionId }) }
    );
    expect((await addRefRes.json()).ok).toBe(true);

    const { POST: validate } = await import("@/app/api/teacher/problems/[id]/versions/[vid]/validate/route");
    const validateRes = await validate(jsonReq(`/api/teacher/problems/${problemId}/versions/${versionId}/validate`, "POST", {}), {
      params: Promise.resolve({ id: problemId, vid: versionId }),
    });
    const validateData = await validateRes.json();
    expect(validateData.ok).toBe(true);
    expect(validateData.gate.passed).toBe(true);

    const { POST: publish } = await import("@/app/api/teacher/problems/[id]/versions/[vid]/publish/route");
    const publishRes = await publish(jsonReq(`/api/teacher/problems/${problemId}/versions/${versionId}/publish`, "POST", {}), {
      params: Promise.resolve({ id: problemId, vid: versionId }),
    });
    const publishData = await publishRes.json();
    expect(publishRes.status).toBe(200);
    expect(publishData.ok).toBe(true);
    expect(publishData.gate.passed).toBe(true);

    mockSession = null;
    const { GET: listArchive } = await import("@/app/api/problems/route");
    const archiveRes = await listArchive(new NextRequest("http://localhost/api/problems"));
    const archiveData = await archiveRes.json();
    expect(archiveData.ok).toBe(true);
    const slugs: string[] = archiveData.items.map((it: { id: string }) => it.id);
    const problemRow = await prisma.problem.findUniqueOrThrow({ where: { id: problemId } });
    expect(slugs).toContain(problemRow.slug);
  });

  it("never leaks hidden test bodies through the public problem detail response", async () => {
    const { prisma } = await import("@/lib/db");
    const teacher = await prisma.user.create({
      data: {
        email: `leak-teacher-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "Leak Teacher",
        role: "TEACHER",
      },
    });
    const { createProblem, runPublishGate, publishVersion } = await import("@/lib/problem-authoring");
    const problem = await createProblem(teacher.id, null, {
      title: "Hidden Body Guard",
      slug: `hidden-body-guard-${Date.now()}`,
      difficulty: "EASY",
      visibility: "PUBLIC",
      statementMd: "Print SECRET_MARKER_XYZ transformed.",
    });
    const versionId = problem.versions[0].id;
    const mainGroup = await prisma.testGroup.findFirstOrThrow({ where: { problemVersionId: versionId, isSample: false } });
    const HIDDEN_TOKEN = "SUPER_SECRET_HIDDEN_EXPECTED_VALUE_42";
    await prisma.testCase.create({
      data: {
        testGroupId: mainGroup.id,
        order: 0,
        label: "hidden",
        inputInline: "1 1\n",
        expectedInline: `${HIDDEN_TOKEN}\n`,
        inputHash: "h1",
        expectedHash: "h2",
        inputBytes: 4,
        expectedBytes: HIDDEN_TOKEN.length + 1,
      },
    });
    await prisma.referenceSolution.create({
      data: { problemVersionId: versionId, language: "c", source: CORRECT_SUM_C, expectedVerdict: "AC" },
    });
    void (await runPublishGate(versionId));
    await publishVersion(problem.id, versionId, { force: true });

    mockSession = null;
    const { GET: detail } = await import("@/app/api/problems/[id]/route");
    const res = await detail(new NextRequest(`http://localhost/api/problems/${problem.id}`), {
      params: Promise.resolve({ id: problem.slug }),
    });
    const raw = await res.text();
    expect(raw).not.toContain(HIDDEN_TOKEN);
  });
});

describe.skipIf(!hasTestDb)("Legacy bank compatibility after DB-backed reads take over", () => {
  it("a legacy bank URL still resolves via the public detail route", async () => {
    mockSession = null;
    const { GET: detail } = await import("@/app/api/problems/[id]/route");
    const res = await detail(new NextRequest("http://localhost/api/problems/set1-q1"), {
      params: Promise.resolve({ id: "set1-q1" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.problem.id).toBe("set1-q1");
  });

  it("an existing submission still resolves its problem title after import", async () => {
    const { prisma } = await import("@/lib/db");
    const { getProblemTitles } = await import("@/lib/problems");
    const student = await prisma.user.create({
      data: {
        email: `legacy-sub-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "Legacy Student",
      },
    });
    const submission = await prisma.submission.create({
      data: {
        userId: student.id,
        problemId: "set1-q1",
        code: "int main(){}",
        language: "c",
        verdict: "AC",
      },
    });
    const titles = await getProblemTitles([submission.problemId]);
    expect(titles.get("set1-q1")).toBeTruthy();
  });
});
