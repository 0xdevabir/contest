import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { isEnabled } from "@/lib/flags";
import { toResponse, ValidationError, ForbiddenError } from "@/lib/errors";
import { requireOwnedProblem } from "@/lib/problem-authoring";
import { draftTranslation } from "@/lib/ai/features/translate";

export const runtime = "nodejs";

const bodySchema = z.object({ problemId: z.string(), versionId: z.string() });

/** D6 — Bangla draft only. Writes ProblemVersion's *Bn fields but never
 * touches bnApprovedById, so Phase 14's visibility gate keeps it hidden
 * from students until a teacher approves it. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isEnabled("ai", { userId: session?.id, role: session?.role }))) {
      throw new ForbiddenError("AI features are not enabled.");
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    const problem = await requireOwnedProblem(parsed.data.problemId, session!);
    assertCan(session, "ai:author", { ownerId: problem.authorId });

    const { jobId, cached, draft } = await draftTranslation({
      problemId: problem.id,
      versionId: parsed.data.versionId,
      actor: session!,
      institutionId: session!.institutionId,
    });

    return NextResponse.json({ ok: true, jobId, cached, draft });
  } catch (err) {
    return toResponse(err);
  }
}
