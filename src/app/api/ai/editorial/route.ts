import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { isEnabled } from "@/lib/flags";
import { toResponse, ValidationError, ForbiddenError } from "@/lib/errors";
import { requireOwnedProblem } from "@/lib/problem-authoring";
import { draftEditorial } from "@/lib/ai/features/editorial";

export const runtime = "nodejs";

const bodySchema = z.object({ problemId: z.string() });

/** Feature 2 — drafts (never publishes) an editorial for the given problem's
 * current published version. Creates/updates Editorial{ published: false }. */
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

    const { jobId, cached, editorialId } = await draftEditorial({
      problemId: problem.id,
      requestedById: session!.id,
      institutionId: session!.institutionId,
    });

    return NextResponse.json({ ok: true, jobId, cached, editorialId });
  } catch (err) {
    return toResponse(err);
  }
}
