export const dynamic = "force-dynamic";

import Link from "next/link";
import type { University } from "@prisma/client";
import { getPracticeLeaderboard } from "@/lib/leaderboard";
import { UNIVERSITIES, universityLabel } from "@/lib/universities";

type Props = { searchParams: Promise<{ uni?: string }> };

export default async function LeaderboardPage({ searchParams }: Props) {
  const { uni } = await searchParams;
  const university = UNIVERSITIES.some((u) => u.code === uni)
    ? (uni as University)
    : undefined;

  let rows: Awaited<ReturnType<typeof getPracticeLeaderboard>> = [];
  let dbError = false;
  try {
    rows = await getPracticeLeaderboard({ university, limit: 100 });
  } catch {
    dbError = true;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold">Leaderboard</h1>
      <p className="mt-2 text-[var(--muted)]">
        Ranked by problems solved in practice. Filter by university.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <UniChip href="/leaderboard" active={!university} label="All" />
        {UNIVERSITIES.map((u) => (
          <UniChip
            key={u.code}
            href={`/leaderboard?uni=${u.code}`}
            active={university === u.code}
            label={u.shortName}
          />
        ))}
      </div>

      {dbError && (
        <p className="mt-6 rounded-lg border border-[var(--warn)]/40 bg-[rgba(240,180,41,0.08)] p-3 text-sm text-[var(--warn)]">
          Database not connected yet. Set <code>DATABASE_URL</code> in{" "}
          <code>.env</code> and run <code>npm run db:push</code>.
        </p>
      )}

      <div className="panel mt-6 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">University</th>
              <th className="px-4 py-3 text-right">Solved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.length === 0 && !dbError && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                  No solves yet — register, solve a problem, and you&apos;ll appear here.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.userId} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-[var(--accent)]">{r.rank}</td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {universityLabel(r.university)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.solved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UniChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--accent)] bg-[rgba(62,207,142,0.12)] text-[var(--accent)]"
          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent-dim)]"
      }`}
    >
      {label}
    </Link>
  );
}
