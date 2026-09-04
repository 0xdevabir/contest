import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { isEnabled } from "@/lib/flags";
import { toResponse, ValidationError, ForbiddenError } from "@/lib/errors";
import { requestHint } from "@/lib/ai/features/hint";

export const runtime = "nodejs";

const bodySchema = z.object({
  problemId: z.string(),
  submissionId: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

/**
 * D5 — feature 5. "Stuck? Get a hint." 403 during a live contest or an open
 * graded assignment, and once the student's 3-per-problem budget is spent
 * (mapped to 429). Enforcement detail lives in src/lib/ai/features/hint.ts;
 * this route is only auth + request shape.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!(await isEnabled("ai", { userId: session?.id, role: session?.role }))) {
      throw new ForbiddenError("AI features are not enabled.");
    }
    assertCan(session, "ai:hint", { ownerId: session?.id });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    const { hintId, text } = await requestHint({
      userId: session!.id,
      institutionId: session!.institutionId,
      problemId: parsed.data.problemId,
      submissionId: parsed.data.submissionId,
      level: parsed.data.level,
    });

    return NextResponse.json({ ok: true, hintId, text });
  } catch (err) {
    return toResponse(err);
  }
}
