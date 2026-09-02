import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEnrolledStudent } from "@/lib/section-access";
import { computeGradebookCached } from "@/lib/gradebook";

type Props = { params: Promise<{ sectionId: string }> };

export default async function StudentSectionPage({ params }: Props) {
  const { sectionId } = await params;
  const session = await getSession();
  if (!session) notFound();

  const enrolled = await isEnrolledStudent(session.id, sectionId);
  if (!enrolled) notFound();

  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    include: { course: true, semester: true, teacher: { select: { name: true } } },
  });
  if (!section) notFound();

  const assignments = await prisma.assignment.findMany({
    where: { sectionId, published: true },
    orderBy: { dueAt: "asc" },
    include: { extensions: { where: { userId: session.id } }, column: true },
  });

  const gradebook = await computeGradebookCached(sectionId);
  const myRow = gradebook.students.find((s) => s.userId === session.id);
  const now = Date.now();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/courses" className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
        ← My courses
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold">
        {section.course.title} — {section.name}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {section.course.code} · {section.semester.name} · {section.teacher.name}
      </p>

      <div className="mt-6 space-y-2">
        {assignments.length === 0 && <p className="text-sm text-[var(--muted)]">No assignments published yet.</p>}
        {assignments.map((a) => {
          const extension = a.extensions[0];
          const effectiveDue = extension?.newDueAt ?? a.dueAt;
          const overdue = effectiveDue ? effectiveDue.getTime() < now : false;
          const published = a.column?.published ?? false;
          const cell = published && a.column ? myRow?.cells[a.column.id] : null;

          return (
            <Link
              key={a.id}
              href={`/courses/${sectionId}/assignments/${a.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 hover:border-[var(--line-strong)]"
            >
              <div>
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {effectiveDue ? `Due ${effectiveDue.toLocaleString()}` : "No due date"}
                  {overdue ? " · overdue" : ""}
                </p>
              </div>
              {cell?.final != null && (
                <span className="rounded border border-[var(--accent-dim)] px-2 py-1 font-mono text-xs text-[var(--accent)]">
                  {Math.round(cell.final * 100) / 100} pts
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
