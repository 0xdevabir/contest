import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NewCourseForm } from "@/components/classroom/NewCourseForm";

export default async function TeacherCoursesPage() {
  const session = await getSession();

  const [courses, departments] = await Promise.all([
    prisma.course.findMany({
      where: { department: { institutionId: session?.institutionId ?? undefined } },
      orderBy: [{ department: { shortName: "asc" } }, { code: "asc" }],
      include: { department: true, _count: { select: { sections: true } } },
    }),
    session?.institutionId
      ? prisma.department.findMany({ where: { institutionId: session.institutionId }, orderBy: { shortName: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Course catalog</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Durable catalog entries — a course&rsquo;s problems and assignments are reusable
            across semesters via <Link href="/teacher/sections" className="link-quiet">sections</Link>.
          </p>
        </div>
      </div>

      <NewCourseForm departments={departments} />

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Sections</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {courses.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[var(--muted)]">
                  No courses yet.
                </td>
              </tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono">{c.code}</td>
                <td className="px-4 py-3 font-medium">{c.title}</td>
                <td className="px-4 py-3">{c.department.shortName}</td>
                <td className="px-4 py-3">{c._count.sections}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
