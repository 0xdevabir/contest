import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { toResponse, NotFoundError, ForbiddenError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; version: string }> };

/** Staff-only historical snapshot read — e.g. "what did the board say before
 * that rejudge". Never touched by ratings/certificates, which always pin an
 * explicit version rather than "latest". */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    const { id, version } = await params;
    const versionNum = Number(version);
    if (!Number.isInteger(versionNum) || versionNum < 1) throw new ValidationError("Invalid version");

    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("viewAllSubmissions")) throw new ForbiddenError("Only contest staff can view historical standings");

    const snapshot = await prisma.contestStandingSnapshot.findUnique({
      where: { contestId_version: { contestId: id, version: versionNum } },
    });
    if (!snapshot) throw new NotFoundError("Snapshot not found");

    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    return toResponse(err);
  }
}
