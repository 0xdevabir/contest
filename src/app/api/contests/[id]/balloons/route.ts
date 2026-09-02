import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, ForbiddenError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** D — the runner-facing undelivered queue, oldest first (docs/phases/PHASE-07-live-contest.md). */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("viewAllSubmissions")) throw new ForbiddenError("Staff only");

    const balloons = await prisma.balloon.findMany({
      where: { contestId: id, deliveredAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        participation: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    const problems = await prisma.contestProblem.findMany({
      where: { contestId: id },
      select: { problemId: true, label: true },
    });
    const labelOf = new Map(problems.map((p) => [p.problemId, p.label]));

    return NextResponse.json({
      ok: true,
      balloons: balloons.map((b) => ({
        id: b.id,
        problemId: b.problemId,
        label: labelOf.get(b.problemId) ?? "?",
        color: b.color,
        createdAt: b.createdAt,
        recipient: b.participation.user.name,
      })),
    });
  } catch (err) {
    return toResponse(err);
  }
}
