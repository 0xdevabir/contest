import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { isEnabled } from "@/lib/flags";
import { toResponse, ValidationError, ForbiddenError } from "@/lib/errors";
import { requireOwnedProblem } from "@/lib/problem-authoring";
import { generateTestData } from "@/lib/ai/features/testgen";

export const runtime = "nodejs";

const bodySchema = z.object({
  versionId: z.string(),
  targetCount: z.number().int().min(1).max(100).default(20),
});

/** D3/feature 1 — "Generate test cases" beside the manual table in the
 * Phase 2 problem editor. Returns the full generated set for review; commit
 * selected cases via POST /api/ai/testgen/[jobId]/accept. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isEnabled("ai", { userId: session?.id, role: session?.role }))) {
      throw new ForbiddenError("AI features are not enabled.");
    }

    const body = await req.json();
    const parsedBody = z.object({ problemId: z.string() }).merge(bodySchema).safeParse(body);
    if (!parsedBody.success) throw new ValidationError("Invalid request", parsedBody.error.flatten());

    const problem = await requireOwnedProblem(parsedBody.data.problemId, session!);
    assertCan(session, "ai:author", { ownerId: problem.authorId });

    const { jobId, cached, result } = await generateTestData({
      problemId: problem.id,
      versionId: parsedBody.data.versionId,
      requestedById: session!.id,
      institutionId: session!.institutionId,
      targetCount: parsedBody.data.targetCount,
    });

    return NextResponse.json({ ok: true, jobId, cached, result });
  } catch (err) {
    return toResponse(err);
  }
}
