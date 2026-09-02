export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { prisma } from "@/lib/db";
import {
  getRatingLeaderboard,
  type RatingLeaderboardMetric,
  type RatingLeaderboardRange,
  type RatingLeaderboardScope,
  type RatingLeaderboardRow,
} from "@/lib/rating-leaderboard";
import { RatingBadge } from "@/components/RatingBadge";
import { PageHeader } from "@/components/PageHeader";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Rating leaderboard — DIU ContestHub",
  description: "National, institution, and department rating leaderboards computed with an Elo-MMR rating system.",
  path: "/leaderboard/rating",
});

const PAGE_SIZE = 100;

type Props = {
  searchParams: Promise<{
    scope?: string;
    institution?: string;
    department?: string;
    metric?: string;
    range?: string;
    cursor?: string;
  }>;
};

export default async function RatingLeaderboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession().catch(() => null);
  const on = await isEnabled("ratings", session ? { userId: session.id, role: session.role } : undefined);
  if (!on) notFound();

  const scope: RatingLeaderboardScope =
    params.scope === "institution" || params.scope === "department" ? params.scope : "national";
  let institutionId = params.institution?.trim() || undefined;
  const department = params.department?.trim() || undefined;
  const metric: RatingLeaderboardMetric = params.metric === "solved" || params.metric === "contests" ? params.metric : "rating";
  const range: RatingLeaderboardRange = params.range === "30d" ? "30d" : "all";
  const cursor = Math.max(0, Number(params.cursor ?? 0) || 0);

  if (scope !== "national" && !institutionId) {
    // Default to the viewer's own institution when scoping without one picked.
    const viewer = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { institutionId: true } }) : null;
    if (!viewer?.institutionId) notFound();
    institutionId = viewer.institutionId;
  }

  const [result, selectedInstitution, topInstitutions] = await Promise.all([
    getRatingLeaderboard({
      scope,
      institutionId,
      department,
      metric,
      range,
      cursor,
      limit: PAGE_SIZE,
      viewerId: session?.id,
    }),
    institutionId ? prisma.institution.findUnique({ where: { id: institutionId } }) : null,
    prisma.institution.findMany({
      where: { verified: true },
      orderBy: { memberCount: "desc" },
      take: 12,
      select: { id: true, shortName: true },
    }),
  ]);

  const linkTo = (next: Partial<Record<"scope" | "institution" | "department" | "metric" | "range", string>>) => {
    const q = new URLSearchParams();
    const s = next.scope ?? scope;
    const inst = next.institution ?? institutionId;
    const dept = next.department ?? department;
    const m = next.metric ?? metric;
    const r = next.range ?? range;
    if (s !== "national") q.set("scope", s);
    if (inst) q.set("institution", inst);
    if (dept) q.set("department", dept);
    if (m !== "rating") q.set("metric", m);
    if (r !== "all") q.set("range", r);
    const qs = q.toString();
    return qs ? `/leaderboard/rating?${qs}` : "/leaderboard/rating";
  };

  const nextCursor = cursor + result.rows.length < result.total ? cursor + PAGE_SIZE : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Leaderboard", path: "/leaderboard" },
          { name: "Rating", path: "/leaderboard/rating" },
        ])}
      />
      <PageHeader
        eyebrow="Standings"
        title="Rating leaderboard"
        lead={
          selectedInstitution
            ? `${selectedInstitution.name} — ranked by Elo-MMR contest rating.`
            : "Ranked by Elo-MMR contest rating. Only verified institution members appear on the national board."
        }
        actions={
          <div className="flex gap-1.5 rounded-lg border border-[var(--line)] p-1">
            <Link href="/leaderboard" className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]">
              Practice
            </Link>
            <span className="rounded-md bg-[var(--accent-surface)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">Rating</span>
          </div>
        }
      />

      <div className="mt-7 space-y-3">
        <FilterRow label="Scope">
          <Chip href={linkTo({ scope: "national", institution: "" })} active={scope === "national"} label="National" />
          <Chip href={linkTo({ scope: "institution" })} active={scope === "institution"} label="My institution" />
        </FilterRow>
        {scope !== "national" && (
          <FilterRow label="Campus">
            {topInstitutions.map((i) => (
              <Chip key={i.id} href={linkTo({ institution: i.id })} active={institutionId === i.id} label={i.shortName} />
            ))}
          </FilterRow>
        )}
        <FilterRow label="Rank by">
          <Chip href={linkTo({ metric: "rating" })} active={metric === "rating"} label="Rating" />
          <Chip href={linkTo({ metric: "solved" })} active={metric === "solved"} label="Solved" />
          <Chip href={linkTo({ metric: "contests" })} active={metric === "contests"} label="Contests" />
        </FilterRow>
        <FilterRow label="Window">
          <Chip href={linkTo({ range: "all" })} active={range === "all"} label="All time" />
          <Chip href={linkTo({ range: "30d" })} active={range === "30d"} label="Most improved (30d)" />
        </FilterRow>
      </div>

      <div className="panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-[var(--line)]">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
                <th className="eyebrow w-12">#</th>
                <th className="eyebrow">Programmer</th>
                <th className="eyebrow hidden md:table-cell">Institution</th>
                <th className="eyebrow text-right">{range === "30d" ? "Gain (30d)" : "Rating"}</th>
                <th className="eyebrow text-right">Contests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {result.rows.map((row) => (
                <RatingRow key={row.userId} row={row} isViewer={row.userId === session?.id} range={range} />
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center text-sm text-[var(--muted)]">
                    Nobody rated yet in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {result.viewer && (
        <div className="mt-4">
          <p className="eyebrow mb-2">Your position</p>
          <div className="panel overflow-hidden">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <tbody>
                <RatingRow row={result.viewer} isViewer range={range} />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nextCursor != null && (
        <div className="mt-5 text-center">
          <Link href={linkTo({}) + (linkTo({}).includes("?") ? "&" : "?") + `cursor=${nextCursor}`} className="btn !py-2 !text-xs">
            Load more
          </Link>
        </div>
      )}
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

function RatingRow({ row, isViewer, range }: { row: RatingLeaderboardRow; isViewer: boolean; range: RatingLeaderboardRange }) {
  return (
    <tr className={isViewer ? "bg-[var(--accent-surface)]" : ""}>
      <td className="tnum px-4 py-3 font-mono text-xs text-[var(--muted)]">#{row.rank}</td>
      <td className="px-4 py-3">
        <Link href={`/u/${row.userId}`} className="font-medium hover:underline">
          {row.name}
        </Link>
        {isViewer ? (
          <span className="ml-2 rounded bg-[var(--accent-surface-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
            YOU
          </span>
        ) : null}
      </td>
      <td className="hidden px-4 py-3 font-mono text-xs text-[var(--muted)] md:table-cell">{row.institutionShortName ?? "—"}</td>
      <td className="px-4 py-3 text-right">
        {range === "30d" ? (
          <span className={`tnum font-mono font-semibold ${((row.gain ?? 0) > 0) ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
            {(row.gain ?? 0) > 0 ? "+" : ""}
            {row.gain}
          </span>
        ) : (
          <RatingBadge rating={row.rating} />
        )}
      </td>
      <td className="tnum px-4 py-3 text-right font-mono text-xs text-[var(--muted)]">{row.contests}</td>
    </tr>
  );
}
