import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionStaff } from "@/lib/section-access";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { RosterWizard } from "@/components/classroom/RosterWizard";
import { RosterRowActions } from "@/components/classroom/RosterRowActions";

type Props = { params: Promise<{ id: string }> };

export default async function SectionRosterPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}/roster`);

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const section = await prisma.courseSection.findUnique({ where: { id }, select: { id: true, name: true, course: { select: { code: true } } } });
  if (!section) notFound();

  const enrollments = await prisma.enrollment.findMany({
    where: { sectionId: id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { name: true, email: true, studentId: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href={`/teacher/sections/${id}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        {section.course.code} — {section.name}
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold">Roster</h1>

      <div className="mt-4">
        <RosterWizard sectionId={id} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Current roster ({enrollments.length})</h2>
        <a href={`/api/teacher/sections/${id}/roster.csv`} className="btn btn-ghost !text-xs">
          <Download size={13} aria-hidden /> Export CSV
        </a>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Student ID</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">
                  No one on the roster yet — import a file above.
                </td>
              </tr>
            )}
            {enrollments.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3">{e.user?.name ?? e.name ?? "—"}</td>
                <td className="px-4 py-3">{e.user?.email ?? e.email ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{e.user?.studentId ?? e.studentId ?? "—"}</td>
                <td className="px-4 py-3">{e.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      e.status === "ACTIVE"
                        ? "text-[var(--accent)]"
                        : e.status === "INVITED"
                          ? "text-[var(--warn)]"
                          : "text-[var(--muted)]"
                    }
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RosterRowActions sectionId={id} enrollmentId={e.id} role={e.role} status={e.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
