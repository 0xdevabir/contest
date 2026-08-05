import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isContestOpen } from "@/lib/contests";

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

    if (contest.status !== "LIVE") {
      return NextResponse.json(
        { ok: false, message: "This contest is not active" },
        { status: 400 }
      );
    }

    if (!isContestOpen(contest.status, contest.startsAt, contest.endsAt)) {
      return NextResponse.json({ ok: false, message: "Contest is over" }, { status: 400 });
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

