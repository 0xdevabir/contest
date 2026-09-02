import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPracticeLeaderboard } from "@/lib/leaderboard";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const institution = await prisma.institution.findUnique({ where: { slug } });
    if (!institution) throw new NotFoundError("Institution not found");

    const board = await getPracticeLeaderboard({
      institutionId: institution.id,
      verifiedOnly: true,
      limit: 50,
    });

    return NextResponse.json({ ok: true, institution, topMembers: board.rows });
  } catch (err) {
    return toResponse(err);
  }
}
