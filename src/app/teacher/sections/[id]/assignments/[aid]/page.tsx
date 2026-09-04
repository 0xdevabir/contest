import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionStaff, isSectionTeacher } from "@/lib/section-access";
import { computeGradebookCached } from "@/lib/gradebook";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { PublishToggle } from "@/components/classroom/PublishToggle";
import { ExtensionForm } from "@/components/classroom/ExtensionForm";

type Props = { params: Promise<{ id: string; aid: string }> };

export default async function AssignmentDetailPage({ params }: Props) {
  const { id, aid } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}/assignments/${aid}`);

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const canManage = session.role === "ADMIN" || (await isSectionTeacher(session.id, id));

  const assignment = await prisma.assignment.findUnique({
    where: { id: aid },
    include: {
      problems: { orderBy: { order: "asc" }, include: { problem: { select: { title: true, slug: true } } } },
      extensions: { include: { user: { select: { name: true } } } },
      column: true,
    },
  });
  if (!assignment || assignment.sectionId !== id) notFound();

  const enrollments = await prisma.enrollment.findMany({
    where: { sectionId: id, status: "ACTIVE", role: "STUDENT" },
    include: { user: { select: { id: true, name: true } } },
  });
  const students = enrollments.filter((e) => e.user).map((e) => ({ userId: e.user!.id, name: e.user!.name }));

  const gradebook = assignment.column ? await computeGradebookCached(id) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href={`/teacher/sections/${id}/assignments`} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        Assignments
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{assignment.title}</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {assignment.dueAt ? `Due ${assignment.dueAt.toLocaleString()}` : "No due date"} · {assignment.latePolicy}
            {assignment.latePolicy !== "NONE" ? ` (${assignment.lateParam})` : ""} · weight {assignment.weight}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/teacher/sections/${id}/assignments/${aid}/integrity`}
            className="btn btn-ghost !py-2 !text-xs"
          >
            <ShieldQuestion size={13} aria-hidden="true" />
            Integrity console
          </Link>
          <PublishToggle assignmentId={assignment.id} published={assignment.published} canManage={canManage} />
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <h2 className="text-sm font-semibold">Problems</h2>
        <ul className="mt-2 space-y-1 text-xs">
          {assignment.problems.map((p) => (
            <li key={p.id} className="flex justify-between border-b border-[var(--line)] py-1.5 last:border-0">
              <span>{p.problem.title}</span>
              <span className="text-[var(--muted)]">{p.points} pts{p.required ? "" : " · optional"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <h2 className="text-sm font-semibold">Per-student progress</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--line)]">
          <table className="w-full min-w-[500px] text-left text-xs">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {students.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-[var(--muted)]">
                    No students enrolled yet.
                  </td>
                </tr>
              )}
              {students.map((s) => {
                const cell = gradebook && assignment.column ? gradebook.students.find((row) => row.userId === s.userId)?.cells[assignment.column!.id] : null;
                return (
                  <tr key={s.userId}>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2">{cell?.status ?? "not graded yet"}</td>
                    <td className="px-3 py-2">{cell?.final != null ? Math.round(cell.final * 100) / 100 : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <h2 className="text-sm font-semibold">Extensions</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Moves the deadline for one student only.</p>
        <div className="mt-3">
          <ExtensionForm assignmentId={assignment.id} students={students} />
        </div>
        {assignment.extensions.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs">
            {assignment.extensions.map((ext) => (
              <li key={ext.id} className="flex justify-between border-b border-[var(--line)] py-1.5 last:border-0">
                <span>{ext.user.name}</span>
                <span className="text-[var(--muted)]">
                  → {ext.newDueAt.toLocaleString()}
                  {ext.reason ? ` (${ext.reason})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
