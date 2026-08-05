export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import type { University } from "@prisma/client";
import { Crown, Medal, Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getPracticeLeaderboard,
  type LeaderboardRange,
  type LeaderboardRow,
  type LeaderboardSort,
} from "@/lib/leaderboard";
import { DIFFICULTY_ORDER, difficultyClass } from "@/lib/difficulty";
import { UNIVERSITIES, universityLabel } from "@/lib/universities";
import { PageHeader } from "@/components/PageHeader";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Leaderboard — Top C programmers across DIU, NSU, AIUB, BRAC",
  description:
    "Live practice and contest leaderboards. See top C programmers at Daffodil International University, North South University, AIUB, and BRAC University — ranked by problems solved on DIU ContestHub.",
  path: "/leaderboard",
  keywords: [
    "C programming leaderboard",
    "competitive programming rankings Bangladesh",
    "DIU programmer leaderboard",
    "NSU programmer leaderboard",
    "AIUB programmer leaderboard",
    "BRAC programmer leaderboard",
  ],
});

const RANGES: { key: LeaderboardRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "30 days" },
  { key: "week", label: "7 days" },
];

type Props = {
  searchParams: Promise<{ uni?: string; range?: string; sort?: string }>;
};

export default async function LeaderboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const university = UNIVERSITIES.some((u) => u.code === params.uni)
    ? (params.uni as University)
    : undefined;
  const range: LeaderboardRange =
    params.range === "week" || params.range === "month" ? params.range : "all";
  const sort: LeaderboardSort = params.sort === "points" ? "points" : "solved";

  const session = await getSession().catch(() => null);

  let data: Awaited<ReturnType<typeof getPracticeLeaderboard>> | null = null;
  let dbError = false;
  try {
    data = await getPracticeLeaderboard({
      university,
      limit: 100,
      range,
      sort,
      viewerId: session?.id,
    });
  } catch {
    dbError = true;
  }

  const rows = data?.rows ?? [];
  const stats = data?.stats;
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const leaderSolved = rows[0]?.solved ?? 0;

  // Preserve the other filters when building a chip link.
  const linkTo = (next: { uni?: string; range?: string; sort?: string }) => {
    const q = new URLSearchParams();
    const uni = next.uni ?? university;
    const r = next.range ?? range;
    const s = next.sort ?? sort;
    if (uni) q.set("uni", uni);
    if (r !== "all") q.set("range", r);
    if (s !== "solved") q.set("sort", s);
    const qs = q.toString();
    return qs ? `/leaderboard?${qs}` : "/leaderboard";
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Leaderboard", path: "/leaderboard" },
        ])}
      />
      <PageHeader
        eyebrow="Standings"
        title="C programming leaderboard"
        lead={
          university
            ? `${universityLabel(university)} — ranked by problems solved on the practice judge.`
            : "Ranked by problems solved across DIU, NSU, AIUB, and BRAC. Points weight harder tiers more heavily."
        }
      />

      {stats && !dbError ? (
        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Ranked solvers" value={stats.solvers} />
          <StatCard label="Problems solved" value={stats.totalSolves} />
          <StatCard label="Active this week" value={stats.activeThisWeek} />
          <StatCard label="Problem bank" value={stats.totalProblems} />
        </div>
      ) : null}

      <div className="mt-7 space-y-3">
        <FilterRow label="Campus">
          <Chip href={linkTo({ uni: "" })} active={!university} label="All" />
          {UNIVERSITIES.map((u) => (
            <Chip
              key={u.code}
              href={linkTo({ uni: u.code })}
              active={university === u.code}
              label={u.shortName}
            />
          ))}
        </FilterRow>
        <FilterRow label="Window">
          {RANGES.map((r) => (
            <Chip
              key={r.key}
              href={linkTo({ range: r.key })}
              active={range === r.key}
              label={r.label}
            />
          ))}
        </FilterRow>
        <FilterRow label="Rank by">
          <Chip href={linkTo({ sort: "solved" })} active={sort === "solved"} label="Solved" />
          <Chip href={linkTo({ sort: "points" })} active={sort === "points"} label="Points" />
        </FilterRow>
      </div>

      {dbError && (
        <p className="mt-6 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-surface)] p-3 text-sm text-[var(--warn)]">
          Database not connected yet. Set <code>DATABASE_URL</code> in <code>.env</code> and run{" "}
          <code>npm run db:push</code>.
        </p>
      )}

      {podium.length > 0 && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {podium.map((row) => (
            <PodiumCard key={row.userId} row={row} isViewer={row.userId === session?.id} />
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="panel mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="border-b border-[var(--line)]">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
                  <th scope="col" className="eyebrow w-12">
                    #
                  </th>
                  <th scope="col" className="eyebrow">
                    Programmer
                  </th>
                  <th scope="col" className="eyebrow hidden md:table-cell">
                    Difficulty mix
                  </th>
                  <th scope="col" className="eyebrow text-right">
                    Points
                  </th>
                  <th scope="col" className="eyebrow text-right">
                    Solved
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-soft)]">
                {(podium.length > 0 ? rest : rows).map((row) => (
                  <Row
                    key={row.userId}
                    row={row}
                    leaderSolved={leaderSolved}
                    isViewer={row.userId === session?.id}
                  />
                ))}
                {rest.length === 0 && podium.length > 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-[var(--muted)]">
                      Only the podium so far — solve a problem to join the table.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && !dbError && (
        <div className="panel mt-8 px-6 py-12 text-center">
          <Trophy className="mx-auto text-[var(--muted-dim)]" size={28} aria-hidden />
          <p className="mt-3 font-display text-lg font-bold">No solves in this window</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--muted)]">
            {range === "all"
              ? "Register, solve a problem, and you will appear here."
              : "Nobody has solved a problem in this window yet — try All time."}
          </p>
          <Link href="/problems" className="btn btn-primary mt-5 !py-2 !text-xs">
            Start solving
          </Link>
        </div>
      )}

      {data?.viewer && (
        <div className="mt-4">
          <p className="eyebrow mb-2">Your position</p>
          <div className="panel overflow-hidden">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <tbody>
                <Row row={data.viewer} leaderSolved={leaderSolved} isViewer />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats && stats.byUniversity.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold">Campus standings</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Total problems solved by each university in this window.
          </p>
          <div className="panel mt-4 divide-y divide-[var(--line-soft)]">
            {stats.byUniversity.map((u) => {
              const top = stats.byUniversity[0].solved || 1;
              return (
                <div key={u.code} className="flex items-center gap-4 px-4 py-3.5">
                  <Link
                    href={linkTo({ uni: u.code })}
                    className="w-14 shrink-0 font-mono text-xs font-semibold text-[var(--accent)]"
                  >
                    {u.code}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--sunken)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${Math.max(4, (u.solved / top) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="tnum shrink-0 font-mono text-xs text-[var(--muted)]">
                    {u.solved} solved · {u.solvers} solver{u.solvers === 1 ? "" : "s"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="mt-8 text-xs text-[var(--muted-dim)]">
        Points weight each tier: Very Easy 1 · Easy 2 · Medium 4 · Medium-Hard 6 · Hard 9 · Very
        Hard 13 · Extreme 20. Ties break by earliest solve.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className="tnum mt-1.5 font-display text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="eyebrow w-14 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-surface)] text-[var(--accent)]"
          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent-dim)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </Link>
  );
}

/** Initials avatar — no uploads yet, so derive a stable monogram from the name. */
function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--accent-surface)] font-mono text-[11px] font-semibold text-[var(--accent)]"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown size={15} className="text-[var(--warn)]" aria-hidden />;
  if (rank === 2) return <Medal size={15} className="text-[var(--muted)]" aria-hidden />;
  if (rank === 3) return <Medal size={15} className="text-[var(--diff-h)]" aria-hidden />;
  return null;
}

/** Stacked bar showing which tiers a solver has cleared. */
function TierMix({ byTier, total }: { byTier: LeaderboardRow["byTier"]; total: number }) {
  if (total === 0) return <span className="text-xs text-[var(--muted-dim)]">—</span>;
  return (
    <div className="flex h-2 w-full max-w-48 overflow-hidden rounded-full bg-[var(--sunken)]">
      {DIFFICULTY_ORDER.map((tier) => {
        const count = byTier[tier];
        if (!count) return null;
        return (
          <span
            key={tier}
            title={`${tier}: ${count}`}
            className={`${difficultyClass(tier)} h-full bg-current`}
            style={{ width: `${(count / total) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

function PodiumCard({ row, isViewer }: { row: LeaderboardRow; isViewer: boolean }) {
  // First place gets the accent border; the rest stay neutral so the hierarchy
  // reads at a glance instead of three equally loud cards.
  const isFirst = row.rank === 1;
  return (
    <div
      className={`panel relative flex flex-col gap-3 p-4 ${
        isFirst ? "border-[var(--accent-border)] bg-[var(--accent-surface)]" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <RankBadge rank={row.rank} />
          <span className="tnum font-mono text-xs text-[var(--muted)]">#{row.rank}</span>
        </span>
        {isViewer ? (
          <span className="rounded bg-[var(--accent-surface-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
            YOU
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Avatar name={row.name} size={40} />
        <div className="min-w-0">
          <Link
            href={`/u/${row.userId}`}
            className="block truncate font-medium hover:text-[var(--accent)]"
          >
            {row.name}
          </Link>
          <p className="truncate font-mono text-[11px] text-[var(--muted)]">{row.university}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="tnum font-display text-2xl font-bold">{row.solved}</p>
          <p className="eyebrow">solved</p>
        </div>
        <div className="text-right">
          <p className="tnum font-mono text-sm text-[var(--accent)]">{row.points}</p>
          <p className="eyebrow">points</p>
        </div>
      </div>
      {row.topTier ? (
        <p className={`font-mono text-[10px] uppercase ${difficultyClass(row.topTier)}`}>
          peak {row.topTier}
        </p>
      ) : null}
    </div>
  );
}

function Row({
  row,
  leaderSolved,
  isViewer,
}: {
  row: LeaderboardRow;
  leaderSolved: number;
  isViewer: boolean;
}) {
  return (
    <tr
      className={`transition-colors hover:bg-[var(--hover)] ${
        isViewer ? "bg-[var(--accent-surface)]" : ""
      }`}
    >
      <td
        className={`tnum px-4 py-3.5 font-mono ${
          row.rank <= 3 ? "text-[var(--accent)]" : "text-[var(--muted-dim)]"
        }`}
      >
        {row.rank}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/u/${row.userId}`}
                className="truncate font-medium hover:text-[var(--accent)]"
              >
                {row.name}
              </Link>
              {isViewer ? (
                <span className="shrink-0 rounded bg-[var(--accent-surface-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                  YOU
                </span>
              ) : null}
            </div>
            <p className="truncate font-mono text-[11px] text-[var(--muted)]">
              {row.university}
              {row.topTier ? (
                <span className={difficultyClass(row.topTier)}> · {row.topTier}</span>
              ) : null}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3.5 md:table-cell">
        <TierMix byTier={row.byTier} total={row.solved} />
      </td>
      <td className="tnum px-4 py-3.5 text-right font-mono text-[var(--accent)]">{row.points}</td>
      <td className="px-4 py-3.5">
        <div className="flex flex-col items-end gap-1">
          <span className="tnum font-mono">{row.solved}</span>
          <span className="block h-1 w-16 overflow-hidden rounded-full bg-[var(--sunken)]">
            <span
              className="block h-full rounded-full bg-[var(--accent-dim)]"
              style={{
                width: `${leaderSolved ? Math.max(6, (row.solved / leaderSolved) * 100) : 0}%`,
              }}
            />
          </span>
        </div>
      </td>
    </tr>
  );
}
