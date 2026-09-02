import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { JoinSectionForm } from "@/components/classroom/JoinSectionForm";

export default async function MyCoursesPage() {
  const session = await getSession();

  const enrollments = await prisma.enrollment.findMany({
    where: { userId: session!.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      section: {
        include: { course: { include: { department: true } }, semester: true, teacher: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold">My courses</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Sections you&rsquo;re enrolled in.</p>

      <div className="mt-4">
        <JoinSectionForm />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {enrollments.length === 0 && (
          <p className="text-sm text-[var(--muted)]">You&rsquo;re not enrolled in any sections yet.</p>
        )}
        {enrollments.map((e) => (
          <Link
            key={e.id}
            href={`/courses/${e.sectionId}`}
            className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 hover:border-[var(--line-strong)]"
          >
            <p className="font-mono text-[10px] text-[var(--muted)]">
              {e.section.course.code} · {e.section.semester.name}
            </p>
            <p className="mt-1 text-sm font-semibold">{e.section.course.title} — {e.section.name}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Taught by {e.section.teacher.name}</p>
            {e.role === "TA" && (
              <span className="mt-2 inline-block rounded border border-[var(--accent-dim)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent)]">
                TA
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
