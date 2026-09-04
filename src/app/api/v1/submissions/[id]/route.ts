import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error } from "@/lib/v1/http";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import { getSubmissionPayload } from "@/lib/submission-payload";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/submissions/{id} — verdict + report. Owner, contest staff, or
 * an admin only; never another user's code. */
export async function GET(req: Request, { params }: Params) {
  try {
    const key = await requireApiKey(req, "submissions:read");
    const { id } = await params;

    const submission = await prisma.submission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundError("Submission not found");

    const isOwner = submission.userId === key.owner.id;
    const isAdmin = key.owner.role === "ADMIN";
    if (!isOwner && !isAdmin) throw new ForbiddenError();

    const payload = await getSubmissionPayload(submission);

    return v1Data({
      id: submission.id,
      problem_id: submission.problemId,
      contest_id: submission.contestId,
      state: submission.state,
      verdict: submission.verdict,
      language: submission.language,
      score: submission.score,
      max_score: submission.maxScore,
      time_ms: submission.timeMs,
      report: payload.report,
      created_at: submission.createdAt.toISOString(),
    });
  } catch (err) {
    return v1Error(err);
  }
}
