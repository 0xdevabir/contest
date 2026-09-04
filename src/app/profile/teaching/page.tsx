import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock, GraduationCap } from "lucide-react";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { isEnabled } from "@/lib/flags";
import { isStaffAnywhere, listStaffSectionIds } from "@/lib/section-access";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Teaching",
  robots: { index: false, follow: false },
};

/**
 * The Profile-side status card for teaching access — who you are (teacher,
 * TA, pending) and the headline numbers. The actual workspace (authoring,
 * rosters, gradebooks) stays at /teacher; this page's only job is to explain
 * status and hand off there, not duplicate it.
 */
export default async function ProfileTeachingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile/teaching");

  const isTeacher = can(session, "problem:create");
  const isPending = session.role === "TEACHER" && !session.teacherApprovedAt;
  const classroomOn = await isEnabled("classroom", { userId: session.id, role: session.role });
  const isTA = !isTeacher && classroomOn && (await isStaffAnywhere(session.id));

  if (!isTeacher && !isPending && !isTA) redirect("/profile");

  if (isPending) {
    return (
      <div>
        <PageHeader eyebrow="Teaching" title="Application pending" />
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-[var(--warn)]/30 bg-[var(--warn-surface)] p-5">
          <Clock size={18} className="mt-0.5 shrink-0 text-[var(--warn)]" aria-hidden />
          <div>
            <p className="text-sm font-medium text-[var(--warn)]">Awaiting admin approval</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              You registered as a teacher — an institution admin needs to approve your account
              before you can author problems, run contests, or manage sections. You&rsquo;ll see
              this page update automatically once that happens.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const [problemsAuthored, contestsCreated, sectionsTaught, taSections] = await Promise.all([
    isTeacher ? prisma.problem.count({ where: session.role === "ADMIN" ? {} : { authorId: session.id } }) : 0,
    isTeacher ? prisma.contest.count({ where: { createdById: session.id } }) : 0,
    isTeacher && classroomOn ? prisma.courseSection.count({ where: { teacherId: session.id } }) : 0,
    isTA
      ? prisma.courseSection.findMany({
          where: { id: { in: await listStaffSectionIds(session.id) } },
          orderBy: { createdAt: "desc" },
          include: { course: true, semester: true, _count: { select: { enrollments: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Teaching"
        title={isTeacher ? "Your teaching workspace" : "Teaching assistant"}
        lead={
          isTeacher
            ? "Author problems, run contests, and manage your sections."
            : "You help staff these sections — rosters, assignments, and grading."
        }
        actions={
          <Link
            href={isTeacher ? "/teacher" : "/teacher/sections"}
            className="btn btn-primary !py-2 !text-xs"
          >
            Open workspace
            <ArrowRight size={13} aria-hidden />
          </Link>
        }
      />

      {isTeacher && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat label="Problems authored" value={problemsAuthored} href="/teacher/problems" />
          <Stat label="Contests created" value={contestsCreated} href="/teacher/contests" />
          {classroomOn && <Stat label="Sections taught" value={sectionsTaught} href="/teacher/sections" />}
        </div>
      )}

      {isTA && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Sections you TA</h2>
          {taSections.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Not staffing any section right now.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {taSections.map((s) => (
                <Link
                  key={s.id}
                  href={`/teacher/sections/${s.id}`}
                  className="panel flex items-center justify-between gap-3 p-4 transition-colors hover:bg-[var(--hover)]"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] text-[var(--muted)]">
                      {s.course.code} · {s.semester.name}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold">{s.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{s._count.enrollments} enrolled</p>
                  </div>
                  <ArrowRight size={15} className="shrink-0 text-[var(--muted)]" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="mt-8 flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <GraduationCap size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" aria-hidden />
        <p className="text-xs text-[var(--muted)]">
          {isTeacher
            ? "Rosters, gradebooks, and problem review all live in the teacher workspace — this page is just your status at a glance."
            : "TA access is section-scoped and non-destructive — you can view rosters, grant extensions, and adjust grade overrides, but not publish assignments or edit the roster itself."}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="panel block p-4 transition-colors hover:bg-[var(--hover)]">
      <p className="eyebrow">{label}</p>
      <p className="font-display tnum mt-2 text-2xl font-bold">{value}</p>
    </Link>
  );
}
