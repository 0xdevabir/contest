import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

const createSchema = z.object({
  departmentId: z.string().optional(),
  departmentName: z.string().trim().min(2).max(120).optional(),
  departmentShortName: z.string().trim().min(1).max(20).optional(),
  code: z.string().trim().min(2).max(30),
  title: z.string().trim().min(2).max(160),
  description: z.string().max(4000).optional(),
  credits: z.number().min(0).max(12).optional(),
});

/** Course catalog within the teacher's own institution/department. */
export async function GET() {
  try {
    const session = await getSession();
    assertCan(session, "course:manage");
    await assertClassroomEnabled(session);

    const courses = await prisma.course.findMany({
      where: { department: { institutionId: session.institutionId ?? undefined } },
      orderBy: [{ department: { shortName: "asc" } }, { code: "asc" }],
      include: { department: true, _count: { select: { sections: true } } },
    });
    return NextResponse.json({ ok: true, courses });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    assertCan(session, "course:manage");
    await assertClassroomEnabled(session);
    if (!session.institutionId) throw new ValidationError("Join an institution before creating courses");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid course data", parsed.error.flatten());
    const data = parsed.data;

    let departmentId = data.departmentId;
    if (!departmentId) {
      if (!data.departmentName || !data.departmentShortName) {
        throw new ValidationError("Provide departmentId or a new department's name + short name");
      }
      const department = await prisma.department.upsert({
        where: { institutionId_shortName: { institutionId: session.institutionId, shortName: data.departmentShortName } },
        update: {},
        create: {
          institutionId: session.institutionId,
          name: data.departmentName,
          shortName: data.departmentShortName,
        },
      });
      departmentId = department.id;
    } else {
      const department = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!department || department.institutionId !== session.institutionId) {
        throw new NotFoundError("Department not found");
      }
    }

    const course = await prisma.course.create({
      data: {
        departmentId,
        code: data.code,
        title: data.title,
        description: data.description ?? "",
        credits: data.credits ?? 3,
      },
    });

    await recordAdminAction({
      actorId: session.id,
      action: "course.create",
      targetType: "COURSE",
      targetId: course.id,
      details: { code: course.code, title: course.title },
    });

    return NextResponse.json({ ok: true, course });
  } catch (err) {
    return toResponse(err);
  }
}
