import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPublicProfile } from "@/lib/profile";
import { getCategories } from "@/lib/problems";
import { difficultyClass } from "@/lib/difficulty";
import { PageHeader } from "@/components/PageHeader";

export default async function ProfileProgressPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile/progress");

  const [profile, solvedRows] = await Promise.all([
    getPublicProfile(session.id, session.id),
    prisma.solvedProblem.findMany({
      where: { userId: session.id },
      select: { problemId: true },
    }),
  ]);
  if (!profile) redirect("/login");

  const solved = new Set(solvedRows.map((r) => r.problemId));
  const categories = getCategories();

  return (
    <div>
      <PageHeader
        eyebrow="Progress"
        title="Solved by difficulty"
        lead={`${profile.stats.solved} of ${profile.stats.totalProblems} problems accepted. Drill into any tier.`}
      />

      <div className="mt-8 space-y-4">
        {profile.stats.byDifficulty.map((tier) => {
          const pct = tier.total ? Math.round((tier.solved / tier.total) * 100) : 0;
          const cat = categories.find((c) => c.tier === tier.tier);
          const solvedInTier = cat?.problems.filter((p) => solved.has(p.id)) ?? [];
          return (
            <section key={tier.tier} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                <div>
                  <p
                    className={`font-mono text-xs uppercase tracking-wide ${difficultyClass(tier.tier)}`}
                  >
                    {tier.tier}
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold">
                    {tier.solved}
                    <span className="text-[var(--muted-dim)]"> / {tier.total}</span>
                  </p>
                </div>
                <div className="w-40">
                  <div className="flex justify-between font-mono text-[10px] text-[var(--muted-dim)]">
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line-soft)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {solvedInTier.length === 0 ? (
                  <li className="px-5 py-4 text-sm text-[var(--muted)]">
                    Nothing solved in this tier yet.
                  </li>
                ) : (
                  solvedInTier.slice(0, 12).map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/problems/${p.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-[var(--hover)]"
                      >
                        <span className="truncate">{p.title}</span>
                        <span className="font-mono text-[10px] text-[var(--accent)]">AC</span>
                      </Link>
                    </li>
                  ))
                )}
                {solvedInTier.length > 12 ? (
                  <li className="px-5 py-3 text-center font-mono text-[11px] text-[var(--muted-dim)]">
                    +{solvedInTier.length - 12} more
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
