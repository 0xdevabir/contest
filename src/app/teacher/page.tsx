import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { listStaffSectionIds } from "@/lib/section-access";
import { prisma } from "@/lib/db";
import { isEnabled } from "@/lib/flags";

type SectionWithMeta = Prisma.CourseSectionGetPayload<{
  include: { course: true; semester: true; _count: { select: { enrollments: true } } };
}>;

export default async function TeacherDashboardPage() {
  const session = await getSession();
  // A TA reaches this dashboard too (teacher/layout.tsx admits them for
  // section access) — they get the sections list only, no problem/contest
  // authoring cards, since those require "problem:create".
  const isTeacher = !!session && can(session, "problem:create");

  const classroomOn = await isEnabled("classroom", session ? { userId: session.id, role: session.role } : undefined);

  let sections: SectionWithMeta[] = [];
  let dueSoon: { id: string; title: string; dueAt: Date | null; sectionName: string; courseCode: string }[] = [];

  if (classroomOn && session) {
    const staffSectionIds = isTeacher ? null : await listStaffSectionIds(session.id);
    const rows = await prisma.courseSection.findMany({
      where: staffSectionIds ? { id: { in: staffSectionIds }, archived: false } : { teacherId: session.id, archived: false },
      orderBy: { createdAt: "desc" },
      include: { course: true, semester: true, _count: { select: { enrollments: true } } },
      take: 6,
    });
    sections = rows;

    const sectionIds = rows.map((s) => s.id);
    if (sectionIds.length > 0) {
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const assignments = await prisma.assignment.findMany({
        where: { sectionId: { in: sectionIds }, published: true, dueAt: { gte: new Date(), lte: in7Days } },
        orderBy: { dueAt: "asc" },
        include: { section: { include: { course: true } } },
      });
      dueSoon = assignments.map((a) => ({
        id: a.id,
        title: a.title,
        dueAt: a.dueAt,
        sectionName: a.section.name,
        courseCode: a.section.course.code,
      }));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold">{isTeacher ? "Teacher dashboard" : "Teaching dashboard"}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {isTeacher ? "Your problems, contests, and courses." : "Sections where you're a teaching assistant."}
      </p>

      {isTeacher && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Link href="/teacher/problems" className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 hover:border-[var(--line-strong)]">
            <p className="text-sm font-semibold">Problems</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Author and review problems.</p>
          </Link>
          <Link href="/teacher/contests" className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 hover:border-[var(--line-strong)]">
            <p className="text-sm font-semibold">Contests</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Run and manage contests.</p>
          </Link>
          {classroomOn && (
            <Link href="/teacher/sections" className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 hover:border-[var(--line-strong)]">
              <p className="text-sm font-semibold">Courses</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Sections, rosters, and gradebooks.</p>
            </Link>
          )}
        </div>
      )}

      {classroomOn && (
        <>
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">My sections this semester</h2>
              <Link href="/teacher/sections" className="text-xs text-[var(--accent)] hover:underline">
                View all →
              </Link>
            </div>
            {sections.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">No sections yet.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sections.map((s) => (
                  <Link
                    key={s.id}
                    href={`/teacher/sections/${s.id}`}
                    className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 hover:border-[var(--line-strong)]"
                  >
                    <p className="font-mono text-[10px] text-[var(--muted)]">{s.course.code} · {s.semester.name}</p>
                    <p className="mt-1 text-sm font-semibold">{s.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{s._count.enrollments} enrolled</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold">Due soon</h2>
            {dueSoon.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">Nothing due in the next 7 days.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
                {dueSoon.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-3 text-xs">
                    <span>
                      {a.courseCode} — {a.title}
                    </span>
                    <span className="text-[var(--muted)]">{a.dueAt?.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
