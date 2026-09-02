import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { getTagMastery, getActivityTimeline } from "@/lib/analytics/student";
import { PageHeader } from "@/components/PageHeader";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";
import { MasteryRadar } from "@/components/analytics/MasteryRadar";

/**
 * PHASE-08 — the student's own view of the same mastery/activity rollups a
 * teacher sees for them. Deliberately the same data, reframed as feedback
 * rather than surveillance.
 */
export default async function ProfileInsightsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile/insights");

  const on = await isEnabled("analytics", { userId: session.id, role: session.role });
  if (!on) notFound();

  const [tagMastery, timeline] = await Promise.all([
    getTagMastery(session.id),
    getActivityTimeline(session.id),
  ]);

  const weakest = [...tagMastery].sort((a, b) => a.mastery - b.mastery).slice(0, 5);
  const heatmapDays = timeline.map((t) => ({ date: t.day, count: t.submitted }));
  const streak = (() => {
    let s = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].submitted > 0) s++;
      else break;
    }
    return s;
  })();

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Your mastery"
        lead="What you're strongest at, what needs work, and how active you've been — the same signals a teacher sees, from your side."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5">
          <p className="text-xs text-[var(--muted)]">Current streak</p>
          <p className="mt-2 font-display text-3xl font-bold">{streak} day{streak === 1 ? "" : "s"}</p>
        </section>
        <section className="panel p-5 lg:col-span-2">
          <p className="mb-3 text-xs text-[var(--muted)]">Activity — last 17 weeks</p>
          <ActivityHeatmap days={heatmapDays} />
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <p className="mb-3 text-xs text-[var(--muted)]">Weakest topics — worth practicing next</p>
        {weakest.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Solve a few problems and your topic breakdown shows up here.</p>
        ) : (
          <MasteryRadar entries={weakest} />
        )}
      </section>

      <section className="panel mt-6 p-5">
        <p className="mb-3 text-xs text-[var(--muted)]">Full topic breakdown</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                <th className="py-2">Topic</th>
                <th className="py-2">Mastery</th>
                <th className="py-2">Solved / attempted</th>
                <th className="py-2">Avg attempts to AC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {tagMastery.map((t) => (
                <tr key={t.tagId}>
                  <td className="py-2">{t.name}</td>
                  <td className="py-2 font-mono">{Math.round(t.mastery * 100)}%</td>
                  <td className="py-2 font-mono">{t.solved}/{t.attempted}</td>
                  <td className="py-2 font-mono">{t.avgAttemptsToAc != null ? t.avgAttemptsToAc.toFixed(1) : "—"}</td>
                </tr>
              ))}
              {tagMastery.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[var(--muted)]">
                    No attempted topics yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
