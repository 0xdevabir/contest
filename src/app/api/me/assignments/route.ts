import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

/** Upcoming + overdue assignments across every section the student is enrolled in. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    await assertClassroomEnabled(session);

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: session.id, status: "ACTIVE" },
      select: { sectionId: true },
    });
    const sectionIds = enrollments.map((e) => e.sectionId);
    if (sectionIds.length === 0) return NextResponse.json({ ok: true, assignments: [] });

    const assignments = await prisma.assignment.findMany({
      where: { sectionId: { in: sectionIds }, published: true },
      orderBy: { dueAt: "asc" },
      include: {
        section: { include: { course: true } },
        extensions: { where: { userId: session.id } },
      },
    });

    const now = Date.now();
    const shaped = assignments.map((a) => {
      const extension = a.extensions[0];
      const effectiveDue = extension?.newDueAt ?? a.dueAt;
      return {
        id: a.id,
        title: a.title,
        sectionId: a.sectionId,
        courseCode: a.section.course.code,
        sectionName: a.section.name,
        dueAt: effectiveDue,
        overdue: effectiveDue ? effectiveDue.getTime() < now : false,
        dueSoon: effectiveDue ? effectiveDue.getTime() - now > 0 && effectiveDue.getTime() - now <= 48 * 60 * 60 * 1000 : false,
      };
    });

    return NextResponse.json({ ok: true, assignments: shaped });
  } catch (err) {
    return toResponse(err);
  }
}
