import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { snapshotContest } from "@/lib/contest-lifecycle";
import { toResponse, NotFoundError, ForbiddenError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Force a new standings snapshot — e.g. after a rejudge changed a finished
 * contest's results. Always creates the next version; never overwrites. */
export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError();

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("edit")) throw new ForbiddenError();

    await snapshotContest(id, "manual", { createdById: session.id });
    const latest = await prisma.contestStandingSnapshot.findFirst({
      where: { contestId: id },
      orderBy: { version: "desc" },
    });

    return NextResponse.json({ ok: true, snapshot: latest });
  } catch (err) {
    return toResponse(err);
  }
}
