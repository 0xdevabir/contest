import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    await assertClassroomEnabled(session);

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: session.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        section: {
          include: {
            course: { include: { department: true } },
            semester: true,
            teacher: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, enrollments });
  } catch (err) {
    return toResponse(err);
  }
}
