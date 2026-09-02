import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { generateJoinCode } from "@/lib/contest-access";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

const createSchema = z.object({
  courseId: z.string(),
  semesterId: z.string(),
  name: z.string().trim().min(1).max(60),
  openEnroll: z.boolean().default(false),
});

async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode();
    const existing = await prisma.courseSection.findUnique({ where: { inviteCode: code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique invite code");
}

/** Sections the signed-in teacher teaches (or all, for an admin). */
export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "section:manage");
    await assertClassroomEnabled(session);

    const sections = await prisma.courseSection.findMany({
      where: session.role === "ADMIN" ? {} : { teacherId: session.id },
      orderBy: { createdAt: "desc" },
      include: {
        course: { include: { department: true } },
        semester: true,
        _count: { select: { enrollments: true, assignments: true } },
      },
    });
    return NextResponse.json({ ok: true, sections });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "section:manage");
    await assertClassroomEnabled(session);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid section data", parsed.error.flatten());
    const data = parsed.data;

    const course = await prisma.course.findUnique({ where: { id: data.courseId }, include: { department: true } });
    if (!course || course.department.institutionId !== session.institutionId) {
      throw new NotFoundError("Course not found");
    }
    const semester = await prisma.semester.findUnique({ where: { id: data.semesterId } });
    if (!semester || semester.institutionId !== session.institutionId) {
      throw new NotFoundError("Semester not found");
    }

    const inviteCode = await uniqueInviteCode();
    const section = await prisma.courseSection.create({
      data: {
        courseId: data.courseId,
        semesterId: data.semesterId,
        name: data.name,
        teacherId: session.id,
        inviteCode,
        openEnroll: data.openEnroll,
      },
      include: { course: true, semester: true },
    });

    await recordAdminAction({
      actorId: session.id,
      action: "section.create",
      targetType: "SECTION",
      targetId: section.id,
      details: { courseId: data.courseId, semesterId: data.semesterId, name: data.name },
    });

    return NextResponse.json({ ok: true, section });
  } catch (err) {
    return toResponse(err);
  }
}
