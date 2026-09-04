import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canViewSharedSolutions } from "@/lib/community";
import { toResponse, ForbiddenError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    let session = null;
    try {
      session = await getSession();
    } catch {
      session = null;
    }

    const gate = await canViewSharedSolutions(session, id);
    if (!gate.visible) throw new ForbiddenError(gate.reason);

    const shared = await prisma.sharedSolution.findMany({
      where: { problemId: id },
      orderBy: { score: "desc" },
      take: 100,
      select: { id: true, userId: true, submissionId: true, language: true, note: true, score: true, createdAt: true },
    });

    const [users, submissions] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: shared.map((s) => s.userId) } }, select: { id: true, name: true } }),
      prisma.submission.findMany({ where: { id: { in: shared.map((s) => s.submissionId) } }, select: { id: true, code: true } }),
    ]);
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    const codeBySubmissionId = new Map(submissions.map((s) => [s.id, s.code]));

    const solutions = shared.map((s) => ({
      ...s,
      authorName: nameById.get(s.userId) ?? "—",
      code: codeBySubmissionId.get(s.submissionId) ?? "",
    }));

    return NextResponse.json({ ok: true, solutions });
  } catch (err) {
    return toResponse(err);
  }
}
