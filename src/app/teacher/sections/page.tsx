import Link from "next/link";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { listStaffSectionIds } from "@/lib/section-access";
import { prisma } from "@/lib/db";
import { NewSectionForm } from "@/components/classroom/NewSectionForm";

export default async function TeacherSectionsPage() {
  const session = await getSession();
  // Creating a section needs "problem:create" (admin or approved teacher);
  // a TA only ever sees sections they staff.
  const isTeacher = !!session && can(session, "problem:create");
  const staffSectionIds = session && !isTeacher ? await listStaffSectionIds(session.id) : null;

  const [sections, courses, semesters] = await Promise.all([
    prisma.courseSection.findMany({
      where:
        session?.role === "ADMIN"
          ? {}
          : staffSectionIds
            ? { id: { in: staffSectionIds } }
            : { teacherId: session?.id },
      orderBy: { createdAt: "desc" },
      include: {
        course: { include: { department: true } },
        semester: true,
        _count: { select: { enrollments: true, assignments: true } },
      },
    }),
    session?.institutionId
      ? prisma.course.findMany({
          where: { department: { institutionId: session.institutionId } },
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
    session?.institutionId
      ? prisma.semester.findMany({ where: { institutionId: session.institutionId }, orderBy: { startsAt: "desc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{isTeacher ? "Your sections" : "Sections you help teach"}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isTeacher
            ? "One running instance of a course, one term, one roster."
            : "You're a TA on these — open one to reach its roster, assignments, and gradebook."}
        </p>
      </div>

      {isTeacher && <NewSectionForm courses={courses} semesters={semesters} />}

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Section</th>
              <th className="px-4 py-3 font-medium">Semester</th>
              <th className="px-4 py-3 font-medium">Roster</th>
              <th className="px-4 py-3 font-medium">Assignments</th>
              <th className="px-4 py-3 text-right font-medium">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {sections.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">
                  No sections yet.
                </td>
              </tr>
            )}
            {sections.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono">{s.course.code}</td>
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{s.semester.name}</td>
                <td className="px-4 py-3">{s._count.enrollments}</td>
                <td className="px-4 py-3">{s._count.assignments}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/teacher/sections/${s.id}`} className="text-[var(--accent)] hover:underline">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
