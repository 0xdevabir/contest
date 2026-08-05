import Link from "next/link";
import type { Verdict } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { getPublicProfile } from "@/lib/profile";
import { universityLabel } from "@/lib/universities";
import { difficultyClass } from "@/lib/difficulty";
import { PageHeader } from "@/components/PageHeader";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";
import { redirect } from "next/navigation";

function formatRank(n: number | null) {
  if (n == null) return "—";
  return `#${n}`;
}

function verdictTone(v: Verdict) {
  if (v === "AC") return "text-[var(--accent)]";
  if (v === "WA" || v === "RE") return "text-[var(--danger)]";
  if (v === "TLE" || v === "MLE") return "text-[var(--warn)]";
  return "text-[var(--muted)]";
}

export default async function ProfileOverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile");

  const profile = await getPublicProfile(session.id, session.id);
  if (!profile) redirect("/login");

  const { stats } = profile;
  const pct = stats.totalProblems
    ? Math.round((stats.solved / stats.totalProblems) * 1000) / 10
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow={universityLabel(profile.university)}
        title={profile.name}
        lead={
          profile.bio?.trim() ||
          "Your practice dashboard — solved problems, rankings, and recent activity."
        }
        actions={
          <Link href={`/u/${profile.id}`} className="btn btn-ghost !py-2 !text-xs">
            Public profile
          </Link>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Solved" value={`${stats.solved}`} hint={`${pct}% of bank`} />
        <Stat
          label="Global rank"
          value={formatRank(stats.globalRank)}
          hint="by problems solved"
        />
        <Stat
          label="Campus rank"
          value={formatRank(stats.uniRank)}
          hint={universityLabel(profile.university)}
        />
        <Stat
          label="Acceptance"
          value={`${stats.acceptanceRate}%`}
          hint={`${stats.acceptedSubs}/${stats.submissions} AC`}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="panel p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Activity</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Submissions over the last 17 weeks
              </p>
            </div>
            <p className="font-mono text-[11px] text-[var(--muted-dim)]">
              {stats.contestsJoined} contest{stats.contestsJoined === 1 ? "" : "s"} joined
            </p>
          </div>
          <div className="mt-5">
            <ActivityHeatmap days={stats.activity} />
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-lg font-bold">Verdicts</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">All-time submission mix</p>
          <ul className="mt-5 space-y-2.5">
            {stats.verdictBreakdown.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">No submissions yet.</li>
            ) : (
              stats.verdictBreakdown
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((v) => {
                  const max = Math.max(...stats.verdictBreakdown.map((x) => x.count), 1);
                  return (
                    <li key={v.verdict}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-mono font-medium ${verdictTone(v.verdict)}`}>
                          {v.verdict}
                        </span>
                        <span className="tnum text-[var(--muted)]">{v.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line-soft)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]/70"
                          style={{ width: `${(v.count / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })
            )}
          </ul>
        </section>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-display text-lg font-bold">Recent solves</h2>
          <Link
            href="/profile/progress"
            className="font-mono text-[11px] text-[var(--muted)] hover:text-[var(--accent)]"
          >
            Full progress →
          </Link>
        </div>
        {stats.recentSolves.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--muted)]">
            No accepted solutions yet.{" "}
            <Link href="/problems" className="text-[var(--accent)] hover:underline">
              Pick a problem
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {stats.recentSolves.map((s) => (
              <li key={s.problemId}>
                <Link
                  href={`/problems/${s.problemId}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className={`mt-0.5 font-mono text-[10px] uppercase ${difficultyClass(s.difficulty)}`}>
                      {s.difficulty}
                    </p>
                  </div>
                  <time
                    dateTime={s.solvedAt.toISOString()}
                    className="shrink-0 font-mono text-[11px] text-[var(--muted-dim)]"
                  >
                    {s.solvedAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="panel p-4">
      <p className="eyebrow">{label}</p>
      <p className="font-display tnum mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-[var(--muted-dim)]">{hint}</p>
    </div>
  );
}
