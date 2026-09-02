import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { getStudentDeepDive } from "@/lib/analytics/student";
import { renderStudentReportPdf } from "@/lib/analytics/export";
import { toResponse, AuthError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; uid: string }> };

/** Student report PDF — for a parent meeting or advising session; teacher only. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    await assertAnalyticsEnabled(session);
    const { id, uid } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const section = await prisma.courseSection.findUnique({ where: { id }, include: { course: true } });
    if (!section) throw new NotFoundError("Section not found");

    const student = await getStudentDeepDive(id, uid);
    if (!student) throw new NotFoundError("Student not found in this section");

    const pdf = await renderStudentReportPdf({ courseCode: section.course.code, sectionName: section.name, student });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="student-report-${uid}.pdf"`,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
