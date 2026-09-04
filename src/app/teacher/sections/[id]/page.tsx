import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionStaff, isSectionTeacher } from "@/lib/section-access";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { CopyInviteCode } from "@/components/classroom/CopyInviteCode";

type Props = { params: Promise<{ id: string }> };

export default async function SectionOverviewPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}`);

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const section = await prisma.courseSection.findUnique({
    where: { id },
    include: {
      course: { include: { department: true } },
      semester: true,
      teacher: { select: { name: true, email: true } },
      assignments: { orderBy: { createdAt: "desc" } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!section) notFound();

  const canManage = session.role === "ADMIN" || (await isSectionTeacher(session.id, id));
  const activeCount = await prisma.enrollment.count({ where: { sectionId: id, status: "ACTIVE", role: "STUDENT" } });
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/courses?code=${section.inviteCode}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/teacher/sections" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        Your sections
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] text-[var(--muted)]">{section.course.code} · {section.semester.name}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{section.course.title} — {section.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Taught by {section.teacher.name}</p>
        </div>
        {!canManage && (
          <span className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--muted)]">
            Viewing as TA
          </span>
        )}
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Roster</p>
          <p className="mt-2 font-display text-2xl font-bold">{activeCount}</p>
          <Link href={`/teacher/sections/${id}/roster`} className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline">
            Manage roster →
          </Link>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Assignments</p>
          <p className="mt-2 font-display text-2xl font-bold">{section.assignments.length}</p>
          <Link href={`/teacher/sections/${id}/assignments`} className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline">
            Manage assignments →
          </Link>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Gradebook</p>
          <p className="mt-2 text-xs text-[var(--muted)]">{section._count.enrollments} enrollments total</p>
          <Link href={`/teacher/sections/${id}/gradebook`} className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline">
            Open gradebook →
          </Link>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Analytics</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Heatmap, weak topics, at-risk students</p>
          <Link href={`/teacher/sections/${id}/analytics`} className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline">
            Open analytics →
          </Link>
        </article>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <p className="text-xs text-[var(--muted)]">Invite code — read aloud in class, or share the link</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-lg tracking-widest">
            {section.inviteCode}
          </span>
          <CopyInviteCode code={section.inviteCode} />
          <span className="truncate font-mono text-[10px] text-[var(--muted)]">{inviteUrl}</span>
        </div>
        {/* TODO: QR code for projecting in class */}
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          {section.openEnroll
            ? "Students may join instantly with this code."
            : "Students who join with this code still need to be on the roster — import one or add them manually."}
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-sm font-semibold">Recent assignments</h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {section.assignments.length === 0 && (
            <p className="p-4 text-xs text-[var(--muted)]">No assignments yet.</p>
          )}
          {section.assignments.slice(0, 8).map((a) => (
            <Link
              key={a.id}
              href={`/teacher/sections/${id}/assignments/${a.id}`}
              className="flex items-center justify-between gap-3 p-4 text-xs hover:bg-[var(--hover)]"
            >
              <span className="font-medium">{a.title}</span>
              <span className="flex items-center gap-2 text-[var(--muted)]">
                {a.dueAt ? `Due ${a.dueAt.toLocaleString()}` : "No due date"}
                <span className={a.published ? "text-[var(--accent)]" : ""}>{a.published ? "Published" : "Draft"}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
