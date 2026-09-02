import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { prisma } from "@/lib/db";
import { toCsvResponseBody } from "@/lib/csv";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const enrollments = await prisma.enrollment.findMany({
      where: { sectionId: id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { name: true, email: true, studentId: true } } },
    });

    const rows: (string | number)[][] = [["Name", "Email", "Student ID", "Role", "Status", "Joined At"]];
    for (const e of enrollments) {
      rows.push([
        e.user?.name ?? e.name ?? "",
        e.user?.email ?? e.email ?? "",
        e.user?.studentId ?? e.studentId ?? "",
        e.role,
        e.status,
        e.joinedAt ? e.joinedAt.toISOString() : "",
      ]);
    }

    return new Response(toCsvResponseBody(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="roster-${id}.csv"`,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
