import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { toResponse, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Section detail + roster — teacher or TA of the section. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const section = await prisma.courseSection.findUnique({
      where: { id },
      include: {
        course: { include: { department: true } },
        semester: true,
        teacher: { select: { id: true, name: true, email: true } },
        enrollments: { orderBy: [{ role: "asc" }, { createdAt: "asc" }], include: { user: { select: { id: true, name: true, email: true } } } },
        assignments: { orderBy: { createdAt: "desc" } },
        _count: { select: { enrollments: true, assignments: true } },
      },
    });
    if (!section) throw new NotFoundError("Section not found");

    return NextResponse.json({ ok: true, section });
  } catch (err) {
    return toResponse(err);
  }
}
