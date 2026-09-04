import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionStaff, isSectionTeacher } from "@/lib/section-access";
import { computeGradebookCached } from "@/lib/gradebook";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { GradebookGrid } from "@/components/classroom/GradebookGrid";

type Props = { params: Promise<{ id: string }> };

export default async function SectionGradebookPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}/gradebook`);

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const section = await prisma.courseSection.findUnique({ where: { id }, select: { id: true, name: true, course: { select: { code: true } } } });
  if (!section) notFound();

  // Score overrides are staff-scoped (assertSectionStaff), but CSV export,
  // snapshots, and adding columns/weights are teacher-only.
  const canManage = session.role === "ADMIN" || (await isSectionTeacher(session.id, id));

  const gradebook = await computeGradebookCached(id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href={`/teacher/sections/${id}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        {section.course.code} — {section.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Gradebook</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {gradebook.totals.studentCount} students · {gradebook.totals.columnCount} columns · class average{" "}
            {Math.round(gradebook.totals.classAverage * 100) / 100}%
          </p>
        </div>
      </div>

      <div className="mt-4">
        <GradebookGrid sectionId={id} students={gradebook.students} columns={gradebook.columns} canManage={canManage} />
      </div>
    </div>
  );
}
