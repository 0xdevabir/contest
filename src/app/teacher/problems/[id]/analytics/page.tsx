import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProblemAnalytics } from "@/lib/analytics/problem";

type Props = { params: Promise<{ id: string }> };

/** D4 — setter analytics: difficulty, discrimination, verdict mix, first-AC language distribution. */
export default async function ProblemAnalyticsPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();

  const problem = await prisma.problem.findUnique({ where: { id }, select: { id: true, authorId: true, title: true, slug: true } });
  if (!problem) notFound();
  assertCan(session, "problem:viewHiddenTests", { ownerId: problem.authorId });

  const analytics = await getProblemAnalytics(id);
  if (!analytics) notFound();

  const totalVerdicts = analytics.verdictDistribution.reduce((s, v) => s + v.count, 0) || 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/teacher/problems" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />
        Your problems
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold">{problem.title}</h1>
      <p className="mt-1 font-mono text-xs text-[var(--muted)]">{problem.slug}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">AC rate</p>
          <p className="mt-2 font-display text-2xl font-bold">{Math.round(analytics.acRate * 100)}%</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{analytics.distinctUsers} distinct solvers attempted</p>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Median attempts to AC</p>
          <p className="mt-2 font-display text-2xl font-bold">{analytics.medianAttemptsToAc ?? "—"}</p>
        </article>
        <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
          <p className="text-xs text-[var(--muted)]">Discrimination</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {analytics.discrimination != null ? analytics.discrimination.toFixed(2) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {analytics.discrimination == null
              ? "Needs 8+ attempters"
              : analytics.discrimination < 0
                ? "Negative — strong students fail, weak students pass. Check the statement/tests."
                : "Correlates with overall skill, as expected."}
          </p>
        </article>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <h2 className="text-sm font-semibold">Verdict distribution</h2>
        <div className="mt-3 space-y-2">
          {analytics.verdictDistribution
            .sort((a, b) => b.count - a.count)
            .map((v) => {
              const pct = Math.round((v.count / totalVerdicts) * 100);
              return (
                <div key={v.verdict} className="text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono">{v.verdict}</span>
                    <span className="text-[var(--muted)]">{v.count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line-soft)]">
                    <div
                      className={`h-full rounded-full ${v.verdict === "AC" ? "bg-[var(--accent)]" : v.verdict === "TLE" || v.verdict === "MLE" ? "bg-[var(--warn)]" : "bg-[var(--danger)]"}`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          {analytics.verdictDistribution.length === 0 && <p className="text-xs text-[var(--muted)]">No submissions yet.</p>}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <h2 className="text-sm font-semibold">First-AC language distribution</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {analytics.firstAcLanguageDistribution.length === 0 && <p className="text-xs text-[var(--muted)]">No AC submissions yet.</p>}
          {analytics.firstAcLanguageDistribution.map((l) => (
            <span key={l.language} className="rounded-full border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px]">
              {l.language} · {l.count}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
