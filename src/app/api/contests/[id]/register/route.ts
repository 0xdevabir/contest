import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { effectiveContestStatus } from "@/lib/contests";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: "Login required" }, { status: 401 });
    }
    if (!session.emailVerified) {
      return NextResponse.json(
        { ok: false, message: "Verify your email before joining contests" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) {
      return NextResponse.json({ ok: false, message: "Contest not found" }, { status: 404 });
    }

    // Joining before the start whistle is the normal case — the gate is only
    // that the admin has published the contest and it has not finished.
    if (effectiveContestStatus(contest.status, contest.endsAt) !== "LIVE") {
      const ended = contest.status === "LIVE" || contest.status === "ENDED";
      return NextResponse.json(
        {
          ok: false,
          message: ended ? "This contest has ended" : "This contest is not open yet",
        },
        { status: 400 }
      );
    }

    await prisma.contestRegistration.upsert({
      where: { contestId_userId: { contestId: id, userId: session.id } },
      update: {},
      create: { contestId: id, userId: session.id },
    });

    return NextResponse.json({ ok: true, message: "Registered" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, message: "Registration failed" }, { status: 500 });
  }
}



