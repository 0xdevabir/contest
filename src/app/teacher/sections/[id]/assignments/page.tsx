import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionStaff, isSectionTeacher } from "@/lib/section-access";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { NewAssignmentForm } from "@/components/classroom/NewAssignmentForm";
import { PublishToggle } from "@/components/classroom/PublishToggle";

type Props = { params: Promise<{ id: string }> };

export default async function SectionAssignmentsPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}/assignments`);

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const section = await prisma.courseSection.findUnique({ where: { id }, select: { id: true, name: true, course: { select: { code: true } } } });
  if (!section) notFound();

  // Creating and publishing assignments is teacher-only; a TA can grant
  // extensions and view progress (assertSectionStaff on those routes).
  const canManage = session.role === "ADMIN" || (await isSectionTeacher(session.id, id));

  const assignments = await prisma.assignment.findMany({
    where: { sectionId: id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { problems: true, extensions: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href={`/teacher/sections/${id}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        {section.course.code} — {section.name}
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Assignments</h1>
      </div>

      {canManage && <NewAssignmentForm sectionId={id} />}

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Problems</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {assignments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted)]">
                  No assignments yet.
                </td>
              </tr>
            )}
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">{a.title}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{a.dueAt ? a.dueAt.toLocaleString() : "—"}</td>
                <td className="px-4 py-3">{a._count.problems}</td>
                <td className="px-4 py-3">
                  <PublishToggle assignmentId={a.id} published={a.published} canManage={canManage} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/teacher/sections/${id}/assignments/${a.id}`} className="text-[var(--accent)] hover:underline">
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
