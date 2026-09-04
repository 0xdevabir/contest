import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { toResponse, NotFoundError, ValidationError } from "@/lib/errors";
import { requireOwnedProblem, assertVersionEditable } from "@/lib/problem-authoring";
import { storeCaseBlob, validateCaseCount } from "@/lib/testdata";
import { reviewAiJob } from "@/lib/ai/job";
import type { TestgenResult } from "@/lib/ai/features/testgen";

export const runtime = "nodejs";

type Params = { params: Promise<{ jobId: string }> };

const bodySchema = z.object({
  groupId: z.string(),
  seeds: z.array(z.number().int()).min(1).max(100),
});

async function nextOrder(groupId: string): Promise<number> {
  const last = await prisma.testCase.findFirst({ where: { testGroupId: groupId }, orderBy: { order: "desc" } });
  return (last?.order ?? -1) + 1;
}

/** Commits teacher-selected generated cases through the exact Phase 2 test-
 * data path (same blob storage, same validation, same publish gate) — "the
 * teacher sees a preview table... per-case accept/reject" (feature 1). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const session = await getSession();

    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    if (!job || job.kind !== "TESTGEN" || job.status !== "SUCCEEDED") throw new NotFoundError("Test-generation job not found");

    const jobInput = job.input as { problemId?: string; versionId?: string };
    if (!jobInput.problemId || !jobInput.versionId) throw new ValidationError("Malformed job input");

    const problem = await requireOwnedProblem(jobInput.problemId, session!);
    assertCan(session, "ai:author", { ownerId: problem.authorId });
    await assertVersionEditable(jobInput.versionId);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    const group = await prisma.testGroup.findUnique({ where: { id: parsed.data.groupId } });
    if (!group || group.problemVersionId !== jobInput.versionId) throw new NotFoundError("Test group not found");

    const result = job.output as unknown as TestgenResult;
    const bySeed = new Map(result.cases.map((c) => [c.seed, c]));

    const toCommit = parsed.data.seeds
      .map((seed) => bySeed.get(seed))
      .filter((c): c is TestgenResult["cases"][number] => !!c && c.valid);
    if (toCommit.length === 0) throw new ValidationError("None of the selected seeds are valid, accepted cases.");

    const existingCount = await prisma.testCase.count({ where: { testGroupId: group.id } });
    validateCaseCount(existingCount + toCommit.length);

    let order = await nextOrder(group.id);
    const created = [];
    for (const c of toCommit) {
      const inBlob = await storeCaseBlob(problem.id, jobInput.versionId, order, "in", Buffer.from(c.input, "utf8"));
      const outBlob = await storeCaseBlob(problem.id, jobInput.versionId, order, "out", Buffer.from(c.expectedOutput, "utf8"));
      const row = await prisma.testCase.create({
        data: {
          testGroupId: group.id,
          order,
          label: `ai-seed-${c.seed}`,
          inputKey: inBlob.key,
          inputInline: inBlob.inline,
          inputHash: inBlob.hash,
          inputBytes: inBlob.bytes,
          expectedKey: outBlob.key,
          expectedInline: outBlob.inline,
          expectedHash: outBlob.hash,
          expectedBytes: outBlob.bytes,
        },
      });
      created.push(row);
      order++;
    }

    await reviewAiJob(jobId, session!.id, true);

    return NextResponse.json({ ok: true, created: created.length });
  } catch (err) {
    return toResponse(err);
  }
}
