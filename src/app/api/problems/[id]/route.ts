import { NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { renderStatement } from "@/lib/statement";
import { getProblemTags } from "@/lib/tags";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gateSpoilerTags } from "@/lib/tags";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Public problem detail: statement, samples, limits. Hidden test I/O is
 * never included here — only the teacher-owner endpoints under
 * /api/teacher/problems can see it. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const problem = await getProblem(id);
    if (!problem) throw new NotFoundError("Problem not found");

    let session = null;
    try {
      session = await getSession();
    } catch {
      session = null;
    }

    let hasSolved = false;
    if (session) {
      const solve = await prisma.solvedProblem.findUnique({
        where: { userId_problemId: { userId: session.id, problemId: id } },
      });
      hasSolved = Boolean(solve);
    }

    const [statementHtml, tags] = await Promise.all([
      renderStatement(problem.statement, id),
      getProblemTags(id).catch(() => []),
    ]);

    return NextResponse.json({
      ok: true,
      problem: {
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        topic: problem.topic,
        statement: problem.statement,
        statementHtml,
        input: problem.input,
        output: problem.output,
        constraints: problem.constraints,
        sampleInput: problem.sampleInput,
        sampleOutput: problem.sampleOutput,
        samples: problem.tests.filter((t) => t.sample),
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        starterCode: problem.starterCode,
        openEnded: problem.openEnded ?? false,
        tags: gateSpoilerTags(tags, hasSolved),
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
