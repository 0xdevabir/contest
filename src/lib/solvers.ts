import { prisma } from "./db";
import type { ProblemSolver } from "./types";

export type { ProblemSolver };

const DEFAULT_LIMIT = 50;

export async function getProblemSolvers(
  problemId: string,
  limit = DEFAULT_LIMIT
): Promise<{ total: number; solvers: ProblemSolver[] }> {
  const where = {
    problemId,
    user: { status: "ACTIVE" as const },
  };

  const [total, rows] = await Promise.all([
    prisma.solvedProblem.count({ where }),
    prisma.solvedProblem.findMany({
      where,
      orderBy: { firstSolvedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        firstSolvedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            university: true,
          },
        },
      },
    }),
  ]);

  return {
    total,
    solvers: rows.map((row) => ({
      userId: row.user.id,
      name: row.user.name,
      university: row.user.university,
      firstSolvedAt: row.firstSolvedAt.toISOString(),
    })),
  };
}
