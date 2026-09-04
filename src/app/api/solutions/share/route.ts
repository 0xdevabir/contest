import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { toResponse, AuthError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  submissionId: z.string().min(1),
  note: z.string().trim().max(500).default(""),
});

/** Opt-in, post-solve-only sharing (D1) — a submission must belong to the
 * caller and be Accepted. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const limited = await consume({ bucket: "solution:share", identity: session.id }, { tokens: 10, windowSec: 300 });
    if (!limited.ok) throw new RateLimitError(retryAfterSeconds(limited.resetAt));

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const submission = await prisma.submission.findUnique({ where: { id: parsed.data.submissionId } });
    if (!submission || submission.userId !== session.id) throw new NotFoundError("Submission not found");
    if (submission.verdict !== "AC") throw new ValidationError("Share a submission that was Accepted");

    const shared = await prisma.sharedSolution.upsert({
      where: { problemId_userId: { problemId: submission.problemId, userId: session.id } },
      update: { submissionId: submission.id, language: submission.language, note: parsed.data.note },
      create: {
        problemId: submission.problemId,
        userId: session.id,
        submissionId: submission.id,
        language: submission.language,
        note: parsed.data.note,
      },
    });

    return NextResponse.json({ ok: true, shared });
  } catch (err) {
    return toResponse(err);
  }
}
