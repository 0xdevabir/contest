import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { assertSectionStaff } from "@/lib/section-access";
import { getStudentDeepDive } from "@/lib/analytics/student";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { MasteryRadar } from "@/components/analytics/MasteryRadar";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";

type Props = { params: Promise<{ id: string; uid: string }> };

/** Teacher-facing deep dive: timeline, tag-mastery, assignment history, attempts distribution. */
export default async function StudentDeepDivePage({ params }: Props) {
  const { id, uid } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}/students/${uid}`);

  const on = await isEnabled("analytics", { userId: session.id, role: session.role });
  if (!on) notFound();

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const student = await getStudentDeepDive(id, uid);
  if (!student) notFound();

  const heatmapDays = student.timeline.map((t) => ({ date: t.day, count: t.submitted }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href={`/teacher/sections/${id}/analytics`} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        Analytics
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{student.name}</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">{student.email}</p>
        </div>
        <a href={`/api/teacher/sections/${id}/students/${uid}/report.pdf`} className="btn btn-ghost !text-xs">
          <FileText size={13} aria-hidden /> Student report PDF
        </a>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="mb-3 text-xs text-[var(--muted)]">Activity — last 17 weeks</p>
          <ActivityHeatmap days={heatmapDays} />
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="mb-3 text-xs text-[var(--muted)]">Attempts to AC vs. class</p>
          <p className="font-mono text-sm">
            {student.attemptsDistribution.userMedian ?? "—"}{" "}
            <span className="text-[var(--muted)]">(class median {student.attemptsDistribution.cohortMedian ?? "—"})</span>
          </p>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <p className="mb-3 text-xs text-[var(--muted)]">Tag mastery</p>
        <MasteryRadar entries={student.tagMastery} limit={20} />
      </section>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-sm font-semibold">Assignment history</h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {student.assignmentHistory.length === 0 && (
            <p className="p-4 text-xs text-[var(--muted)]">No published assignments yet.</p>
          )}
          {student.assignmentHistory.map((a) => (
            <div key={a.assignmentId} className="flex items-center justify-between gap-3 p-4 text-xs">
              <span className="font-medium">{a.title}</span>
              <span className="text-[var(--muted)]">
                {a.percent != null ? `${Math.round(a.percent)}%` : "not started"}
                {a.dueAt ? ` · due ${a.dueAt.toLocaleDateString()}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-sm font-semibold">Recent submissions</h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {student.recentSubmissions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-4 text-xs">
              <span className="font-mono">{s.problemId}</span>
              <span className="flex items-center gap-3 text-[var(--muted)]">
                {s.language}
                <span className={s.verdict === "AC" ? "text-[var(--accent)]" : "text-[var(--danger)]"}>{s.verdict}</span>
                {s.createdAt.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
