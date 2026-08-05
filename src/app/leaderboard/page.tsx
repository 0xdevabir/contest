export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import type { University } from "@prisma/client";
import { getPracticeLeaderboard } from "@/lib/leaderboard";
import { UNIVERSITIES, universityLabel } from "@/lib/universities";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Leaderboard — Top C programmers across DIU, NSU, AIUB, BRAC",
  description:
    "Live practice and contest leaderboards. See top C programmers at Daffodil International University, North South University, AIUB, and BRAC University — ranked by problems solved.",
  keywords: [
    "C programming leaderboard",
    "competitive programming rankings",
    "DIU programmer leaderboard",
    "NSU programmer leaderboard",
    "AIUB programmer leaderboard",
    "BRAC programmer leaderboard",
    "Bangladesh programming rankings",
  ],
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Leaderboard — Top C programmers across DIU, NSU, AIUB, BRAC",
    description:
      "Live practice and contest leaderboards across DIU, NSU, AIUB, BRAC.",
    url: "/leaderboard",
  },
  twitter: {
    title: "Leaderboard — Top C programmers",
    description:
      "Live leaderboards across DIU, NSU, AIUB, BRAC.",
  },
};

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
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Standings"
        title="Leaderboard"
        lead="Ranked by problems solved in practice. Filter by university."
      />

      <div className="mt-8 flex flex-wrap gap-2">
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
          <thead className="border-b border-[var(--line)]">
            <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
              <th className="eyebrow w-12">#</th>
              <th className="eyebrow">Name</th>
              <th className="eyebrow">University</th>
              <th className="eyebrow text-right">Solved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {rows.length === 0 && !dbError && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                  No solves yet — register, solve a problem, and you&apos;ll appear here.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.userId} className="transition-colors hover:bg-white/[0.02]">
                {/* Accent only on the podium — colouring every rank makes the
                    column read as decoration instead of signal. */}
                <td
                  className={`tnum px-4 py-3.5 font-mono ${
                    r.rank <= 3 ? "text-[var(--accent)]" : "text-[var(--muted-dim)]"
                  }`}
                >
                  {r.rank}
                </td>
                <td className="px-4 py-3.5 font-medium">{r.name}</td>
                <td className="px-4 py-3.5 text-[var(--muted)]">
                  {universityLabel(r.university)}
                </td>
                <td className="tnum px-4 py-3.5 text-right font-mono">{r.solved}</td>
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

