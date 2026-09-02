import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { getSectionSummary } from "@/lib/analytics/cohort";
import { computeGradebookCached } from "@/lib/gradebook";
import { renderClassReportPdf } from "@/lib/analytics/export";
import { toResponse, AuthError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Class report PDF — teacher only (D5-style: TAs don't get the export surface). */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    await assertAnalyticsEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const section = await prisma.courseSection.findUnique({
      where: { id },
      include: { course: true, semester: true, teacher: { select: { name: true } } },
    });
    if (!section) throw new NotFoundError("Section not found");

    const [summary, gradebook] = await Promise.all([getSectionSummary(id), computeGradebookCached(id)]);

    const pdf = await renderClassReportPdf({
      courseCode: section.course.code,
      sectionName: section.name,
      semesterName: section.semester.name,
      teacherName: section.teacher.name,
      summary,
      students: gradebook.students.map((s) => ({ name: s.name, total: s.total })),
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="class-report-${id}.pdf"`,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
