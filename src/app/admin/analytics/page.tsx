import Link from "next/link";
import type { University, Verdict } from "@prisma/client";
import { BarChart3, Target, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getProblem } from "@/lib/problems";
import { universityLabel } from "@/lib/universities";

type Props = { searchParams: Promise<{ range?: string }> };

export default async function AdminAnalyticsPage({ searchParams }: Props) {
  const { range = "30" } = await searchParams;
  const days = range === "7" ? 7 : range === "all" ? null : 30;
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
  const where = since ? { createdAt: { gte: since } } : {};

  const [submissions, newUsers, solved, contestCount] = await Promise.all([
    prisma.submission.findMany({
      where,
      select: {
        verdict: true,
        problemId: true,
        createdAt: true,
        user: { select: { university: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.solvedProblem.count({ where: since ? { firstSolvedAt: { gte: since } } : {} }),
    prisma.contest.count({ where: since ? { createdAt: { gte: since } } : {} }),
  ]);

  const accepted = submissions.filter((item) => item.verdict === "AC").length;
  const acceptance = submissions.length ? Math.round((accepted / submissions.length) * 100) : 0;
  const verdictCounts = countBy(submissions, (item) => item.verdict);
  const universityStats = buildUniversityStats(submissions);
  const problemCounts = countBy(submissions, (item) => item.problemId);
  const topProblems = [...problemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const activity = buildActivity(submissions, days ?? 30);
  const activityMax = Math.max(...activity.map((item) => item.count), 1);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Platform intelligence
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Participation, judge quality, university performance, and problem demand.
          </p>
        </div>
        <div className="flex rounded-lg border border-[var(--line)] p-1 text-xs">
          {[
            ["7", "7 days"],
            ["30", "30 days"],
            ["all", "All time"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`/admin/analytics?range=${value}`}
              className={`rounded-md px-3 py-1.5 ${
                range === value
                  ? "bg-white/[0.07] text-[var(--text)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={BarChart3} label="Submissions" value={submissions.length} />
        <Metric icon={Target} label="Acceptance rate" value={`${acceptance}%`} />
        <Metric icon={Users} label="New users" value={newUsers} />
        <Metric icon={Trophy} label="New contests" value={contestCount} />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="panel p-5">
          <h2 className="font-display text-lg font-bold">Submission volume</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Daily judge requests in the selected period
          </p>
          <div className="mt-6 flex h-56 items-end gap-1">
            {activity.map((item, index) => (
              <div key={`${item.label}-${index}`} className="group relative flex h-full flex-1 items-end">
                <div
                  className="w-full min-w-1 rounded-t-sm bg-[var(--info)]/70"
                  style={{ height: `${Math.max((item.count / activityMax) * 100, 2)}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-black px-2 py-1 font-mono text-[9px] group-hover:block">
                  {item.label}: {item.count}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-lg font-bold">Verdict mix</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Distribution across judge outcomes
          </p>
          <div className="mt-5 space-y-3">
            {(["AC", "WA", "CE", "RE", "TLE", "MLE", "ERROR"] as Verdict[]).map(
              (verdict) => {
                const count = verdictCounts.get(verdict) ?? 0;
                const percent = submissions.length
                  ? Math.round((count / submissions.length) * 100)
                  : 0;
                return (
                  <div key={verdict}>
                    <div className="mb-1 flex justify-between font-mono text-[10px]">
                      <span className={verdict === "AC" ? "text-[var(--accent)]" : ""}>
                        {verdict}
                      </span>
                      <span className="text-[var(--muted)]">
                        {count} · {percent}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                      <div
                        className={verdict === "AC" ? "h-full bg-[var(--accent)]" : "h-full bg-[var(--warn)]"}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-display text-lg font-bold">University performance</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Submission volume and acceptance by institution
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--line)] text-[10px] uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3 font-medium">University</th>
                  <th className="px-5 py-3 text-right font-medium">Runs</th>
                  <th className="px-5 py-3 text-right font-medium">Accepted</th>
                  <th className="px-5 py-3 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {universityStats.map((item) => (
                  <tr key={item.university}>
                    <td className="px-5 py-3">{universityLabel(item.university)}</td>
                    <td className="px-5 py-3 text-right font-mono">{item.total}</td>
                    <td className="px-5 py-3 text-right font-mono text-[var(--accent)]">
                      {item.accepted}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{item.rate}%</td>
                  </tr>
                ))}
                {universityStats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-[var(--muted)]">
                      No user submissions in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-display text-lg font-bold">Most attempted problems</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Problems generating the most judge activity
            </p>
          </div>
          <ol className="divide-y divide-[var(--line)]">
            {topProblems.map(([problemId, count], index) => (
              <li key={problemId} className="flex items-center gap-3 px-5 py-3">
                <span className="font-mono text-[10px] text-[var(--muted)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {getProblem(problemId)?.title ?? problemId}
                  </p>
                  <p className="font-mono text-[9px] text-[var(--muted)]">{problemId}</p>
                </div>
                <span className="font-mono text-xs">{count}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p className="mt-5 text-right text-[10px] text-[var(--muted)]">
        {solved.toLocaleString()} first-time solves recorded in this period.
      </p>
    </div>
  );
}

function countBy<T, K>(items: T[], key: (item: T) => K) {
  const result = new Map<K, number>();
  items.forEach((item) => {
    const value = key(item);
    result.set(value, (result.get(value) ?? 0) + 1);
  });
  return result;
}

function buildUniversityStats(
  submissions: Array<{ verdict: Verdict; user: { university: University } | null }>
) {
  const map = new Map<University, { total: number; accepted: number }>();
  submissions.forEach((submission) => {
    if (!submission.user) return;
    const current = map.get(submission.user.university) ?? { total: 0, accepted: 0 };
    current.total += 1;
    if (submission.verdict === "AC") current.accepted += 1;
    map.set(submission.user.university, current);
  });
  return [...map.entries()]
    .map(([university, value]) => ({
      university,
      ...value,
      rate: value.total ? Math.round((value.accepted / value.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function buildActivity(
  submissions: Array<{ createdAt: Date }>,
  days: number
) {
  const length = Math.min(days, 30);
  return Array.from({ length }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (length - 1 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return {
      label: date.toLocaleDateString("en", { month: "short", day: "numeric" }),
      count: submissions.filter(
        (submission) => submission.createdAt >= date && submission.createdAt < next
      ).length,
    };
  });
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex justify-between">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <Icon size={15} className="text-[var(--muted)]" />
      </div>
      <p className="mt-2 font-display text-2xl font-bold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
