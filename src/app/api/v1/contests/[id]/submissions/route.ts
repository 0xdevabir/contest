import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error, encodeCursor, parsePageParams } from "@/lib/v1/http";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import { contestCapabilities } from "@/lib/contest-access";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/contests/{id}/submissions — staff-scoped (viewAllSubmissions). */
export async function GET(req: Request, { params }: Params) {
  try {
    const key = await requireApiKey(req, "submissions:read");
    const { id } = await params;

    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(key.owner, contest);
    if (!caps.has("viewAllSubmissions")) throw new ForbiddenError("Staff only");

    const url = new URL(req.url);
    const { limit, cursor } = parsePageParams(url);

    const rows = await prisma.submission.findMany({
      where: { contestId: id },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
      orderBy: { id: "asc" },
      select: { id: true, userId: true, problemId: true, verdict: true, language: true, score: true, createdAt: true },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return v1Data(
      page.map((s) => ({
        id: s.id,
        user_id: s.userId,
        problem_id: s.problemId,
        verdict: s.verdict,
        language: s.language,
        score: s.score,
        created_at: s.createdAt.toISOString(),
      })),
      { nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null, hasMore }
    );
  } catch (err) {
    return v1Error(err);
  }
}
