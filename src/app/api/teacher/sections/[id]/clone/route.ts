import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { generateJoinCode } from "@/lib/contest-access";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  targetSemesterId: z.string(),
  name: z.string().trim().min(1).max(60).optional(),
});

async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode();
    if (!(await prisma.courseSection.findUnique({ where: { inviteCode: code } }))) return code;
  }
  throw new Error("Could not generate a unique invite code");
}

/**
 * Semester rollover (D-nothing named, but the doc's "Semester rollover"
 * section): clones assignments (with dates shifted by the gap between the
 * two semesters' start dates), gradebook columns, and TA enrollments. Never
 * copies students or contests.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid clone request", parsed.error.flatten());

    const source = await prisma.courseSection.findUnique({
      where: { id },
      include: {
        semester: true,
        assignments: { include: { problems: true } },
        columns: true,
        enrollments: { where: { role: "TA", status: "ACTIVE" } },
      },
    });
    if (!source) throw new NotFoundError("Section not found");

    const targetSemester = await prisma.semester.findUnique({ where: { id: parsed.data.targetSemesterId } });
    if (!targetSemester || targetSemester.institutionId !== session.institutionId) {
      throw new NotFoundError("Target semester not found");
    }

    const shiftMs = targetSemester.startsAt.getTime() - source.semester.startsAt.getTime();
    const shift = (d: Date | null) => (d ? new Date(d.getTime() + shiftMs) : null);

    const inviteCode = await uniqueInviteCode();

    const cloned = await prisma.$transaction(async (tx) => {
      const newSection = await tx.courseSection.create({
        data: {
          courseId: source.courseId,
          semesterId: targetSemester.id,
          name: parsed.data.name ?? source.name,
          teacherId: session.id,
          inviteCode,
          openEnroll: source.openEnroll,
          clonedFromId: source.id,
        },
      });

      for (const assignment of source.assignments) {
        const newAssignment = await tx.assignment.create({
          data: {
            sectionId: newSection.id,
            title: assignment.title,
            descriptionMd: assignment.descriptionMd,
            opensAt: shift(assignment.opensAt),
            dueAt: shift(assignment.dueAt),
            closesAt: shift(assignment.closesAt),
            latePolicy: assignment.latePolicy,
            lateParam: assignment.lateParam,
            weight: assignment.weight,
            published: false,
            showPeers: assignment.showPeers,
            problems: {
              create: assignment.problems.map((p) => ({
                problemId: p.problemId,
                problemVersionId: p.problemVersionId,
                order: p.order,
                points: p.points,
                required: p.required,
              })),
            },
          },
        });
        await tx.gradebookColumn.create({
          data: {
            sectionId: newSection.id,
            source: "ASSIGNMENT",
            assignmentId: newAssignment.id,
            title: assignment.title,
            maxPoints: assignment.problems.reduce((s, p) => s + p.points, 0) || 100,
            weight: source.columns.find((c) => c.assignmentId === assignment.id)?.weight ?? 1,
            order: source.columns.find((c) => c.assignmentId === assignment.id)?.order ?? 0,
            published: false,
          },
        });
      }

      for (const manual of source.columns.filter((c) => c.source === "MANUAL")) {
        await tx.gradebookColumn.create({
          data: {
            sectionId: newSection.id,
            source: "MANUAL",
            title: manual.title,
            maxPoints: manual.maxPoints,
            weight: manual.weight,
            order: manual.order,
            published: false,
          },
        });
      }

      for (const ta of source.enrollments) {
        if (!ta.userId) continue;
        await tx.enrollment.create({
          data: {
            sectionId: newSection.id,
            userId: ta.userId,
            role: "TA",
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        });
      }

      return newSection;
    });

    await recordAdminAction({
      actorId: session.id,
      action: "section.clone",
      targetType: "SECTION",
      targetId: cloned.id,
      details: { clonedFromId: source.id, targetSemesterId: targetSemester.id },
    });

    return NextResponse.json({ ok: true, section: cloned });
  } catch (err) {
    return toResponse(err);
  }
}
