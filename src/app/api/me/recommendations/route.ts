import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, AuthError } from "@/lib/errors";
import { prismaDifficultyToLabel } from "@/lib/difficulty";

export const runtime = "nodejs";

/** D4 — precomputed nightly (worker/src/recommend-tick.ts); this route only
 * reads ProblemRecommendation, it never scores or calls the model itself. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();

    const rows = await prisma.problemRecommendation.findMany({
      where: { userId: session.id },
      orderBy: { score: "desc" },
      take: 20,
    });

    const problems = await prisma.problem.findMany({
      where: { id: { in: rows.map((r) => r.problemId) } },
      select: { id: true, slug: true, title: true, difficulty: true },
    });
    const problemById = new Map(problems.map((p) => [p.id, p]));

    return NextResponse.json({
      ok: true,
      recommendations: rows
        .map((r) => {
          const problem = problemById.get(r.problemId);
          if (!problem) return null;
          return {
            problemId: r.problemId,
            slug: problem.slug,
            title: problem.title,
            difficulty: prismaDifficultyToLabel(problem.difficulty),
            score: r.score,
            reason: r.reason,
            computedAt: r.computedAt,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    });
  } catch (err) {
    return toResponse(err);
  }
}
