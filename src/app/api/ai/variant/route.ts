import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { isEnabled } from "@/lib/flags";
import { toResponse, ValidationError, ForbiddenError } from "@/lib/errors";
import { requireOwnedProblem } from "@/lib/problem-authoring";
import { draftVariantTemplate } from "@/lib/ai/features/variant";

export const runtime = "nodejs";

const bodySchema = z.object({ problemId: z.string() });

/** Feature 3 — drafts a Phase 10 ProblemVariantTemplate and verifies it
 * across 20 seeds before returning. `verification.ok === false` means the
 * teacher must not activate this template yet (acceptance criterion 4). */
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

    const { jobId, cached, templateId, verification } = await draftVariantTemplate({
      problemId: problem.id,
      requestedById: session!.id,
      institutionId: session!.institutionId,
    });

    return NextResponse.json({ ok: true, jobId, cached, templateId, verification });
  } catch (err) {
    return toResponse(err);
  }
}
