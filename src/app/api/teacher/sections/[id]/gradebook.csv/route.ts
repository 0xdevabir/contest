import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertCan } from "@/lib/authz";
import { assertSectionTeacher } from "@/lib/section-access";
import { computeGradebook } from "@/lib/gradebook";
import { toCsvResponseBody } from "@/lib/csv";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Teacher only — D5 explicitly withholds "export the final gradebook" from TAs. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);
    assertCan(session, "gradebook:export", { ownerId: session.id });

    const gradebook = await computeGradebook(id);

    const header = ["Name", "Email", "Student ID", ...gradebook.columns.map((c) => c.title), "Total (%)"];
    const rows: (string | number)[][] = [header];
    for (const student of gradebook.students) {
      rows.push([
        student.name,
        student.email,
        student.studentId ?? "",
        ...gradebook.columns.map((c) => {
          const cell = student.cells[c.id];
          return cell?.final != null ? Math.round(cell.final * 100) / 100 : "";
        }),
        Math.round(student.total * 100) / 100,
      ]);
    }

    return new Response(toCsvResponseBody(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gradebook-${id}.csv"`,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
