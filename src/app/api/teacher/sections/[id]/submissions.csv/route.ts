import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { toCsvResponseBody } from "@/lib/csv";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Raw submissions CSV — for a teacher's own analysis, scoped to their section's roster. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    await assertAnalyticsEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const enrollments = await prisma.enrollment.findMany({
      where: { sectionId: id, status: "ACTIVE", role: "STUDENT" },
      select: { userId: true },
    });
    const userIds = enrollments.map((e) => e.userId).filter((x): x is string => !!x);

    const submissions =
      userIds.length > 0
        ? await prisma.submission.findMany({
            where: { userId: { in: userIds }, state: "DONE" },
            orderBy: { createdAt: "desc" },
            include: { user: { select: { name: true, email: true } } },
            take: 20000,
          })
        : [];

    const header = ["Student", "Email", "Problem", "Verdict", "Score", "Max score", "Language", "Time (ms)", "Submitted at"];
    const rows: (string | number)[][] = [header];
    for (const s of submissions) {
      rows.push([
        s.user?.name ?? "",
        s.user?.email ?? "",
        s.problemId,
        s.verdict,
        s.score,
        s.maxScore,
        s.language,
        s.timeMs ?? "",
        s.createdAt.toISOString(),
      ]);
    }

    return new Response(toCsvResponseBody(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="submissions-${id}.csv"`,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
