import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEnabled } from "@/lib/flags";
import { assertSectionStaff, isSectionTeacher } from "@/lib/section-access";
import { getSectionSummary, getHeatmap } from "@/lib/analytics/cohort";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { SignalChips } from "@/components/analytics/SignalChips";
import { MasteryRadar } from "@/components/analytics/MasteryRadar";
import { Heatmap } from "@/components/analytics/Heatmap";

type Props = { params: Promise<{ id: string }> };

/**
 * D3 — the anchor screen. Header stats, at-risk list with explainable
 * signals, weak-topic ranking, then the student x problem heatmap.
 */
export default async function SectionAnalyticsPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}/analytics`);

  const on = await isEnabled("analytics", { userId: session.id, role: session.role });
  if (!on) notFound();

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const section = await prisma.courseSection.findUnique({ where: { id }, select: { name: true, course: { select: { code: true } } } });
  if (!section) notFound();

  const canManage = session.role === "ADMIN" || (await isSectionTeacher(session.id, id));

  const [summary, heatmap] = await Promise.all([getSectionSummary(id), getHeatmap(id)]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href={`/teacher/sections/${id}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        {section.course.code} — {section.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Analytics</h1>
          {summary.updatedAt && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Rolled up {summary.updatedAt.toLocaleString()}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <a href={`/api/teacher/sections/${id}/submissions.csv`} className="btn btn-ghost !text-xs">
              <Download size={13} aria-hidden /> Raw submissions CSV
            </a>
            <a href={`/api/teacher/sections/${id}/report.pdf`} className="btn btn-ghost !text-xs">
              <FileText size={13} aria-hidden /> Class report PDF
            </a>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Active students (14d)</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {summary.activeStudents}
            <span className="text-base font-normal text-[var(--muted)]">/{summary.totalStudents}</span>
          </p>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Median solved</p>
          <p className="mt-2 font-display text-2xl font-bold">{summary.medianSolved}</p>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Submissions this week</p>
          <p className="mt-2 font-display text-2xl font-bold">{summary.submissionsThisWeek}</p>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">At risk</p>
          <p className="mt-2 font-display text-2xl font-bold text-[var(--warn)]">{summary.atRisk.length}</p>
        </article>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          <div className="mt-3 space-y-3">
            {summary.atRisk.length === 0 && <p className="text-xs text-[var(--muted)]">No one flagged right now.</p>}
            {summary.atRisk.map((s) => (
              <div key={s.userId} className="rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/teacher/sections/${id}/students/${s.userId}`} className="text-xs font-medium hover:underline">
                    {s.name}
                  </Link>
                  <span className="font-mono text-[10px] text-[var(--muted)]">{s.signals.length} signals</span>
                </div>
                <div className="mt-2">
                  <SignalChips signals={s.signals} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <h2 className="text-sm font-semibold">Weakest topics</h2>
          <div className="mt-3">
            {summary.weakTags.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Not enough attempted problems yet.</p>
            ) : (
              <MasteryRadar
                entries={summary.weakTags.map((t) => ({ tagId: t.tagId, name: t.name, mastery: t.mastery, attempted: t.sampleSize, solved: 0 }))}
              />
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <h2 className="text-sm font-semibold">Heatmap</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          A vertical stripe is a broken problem; a horizontal stripe is a stuck student; an empty row hasn&apos;t started.
        </p>
        <div className="mt-3">
          <Heatmap sectionId={id} students={heatmap.students} problems={heatmap.problems} cells={heatmap.cells} />
        </div>
      </section>
    </div>
  );
}
