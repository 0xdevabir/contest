export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { getSeasonStandings } from "@/lib/seasons";
import { PageHeader } from "@/components/PageHeader";
import { RatingBadge } from "@/components/RatingBadge";
import { buildPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildPageMetadata({
    title: `${slug} season standings`,
    path: `/seasons/${slug}`,
    description: "Final rating standings for a DIU ContestHub competitive season.",
  });
}

export default async function SeasonPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession().catch(() => null);
  const on = await isEnabled("ratings", session ? { userId: session.id, role: session.role } : undefined);
  if (!on) notFound();

  const data = await getSeasonStandings(slug);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow={data.season.closedAt ? "Archived season" : "Season in progress"}
        title={data.season.name}
        lead={`${data.season.startsAt.toLocaleDateString()} – ${data.season.endsAt.toLocaleDateString()}${
          data.season.closedAt ? " · Final table" : " · Standings will lock when the season closes"
        }`}
      />

      <div className="panel mt-7 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-[var(--line)]">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
                <th className="eyebrow w-12">#</th>
                <th className="eyebrow">Programmer</th>
                <th className="eyebrow hidden md:table-cell">Institution</th>
                <th className="eyebrow text-right">Rating</th>
                <th className="eyebrow text-right">Gain</th>
                <th className="eyebrow text-right">Solved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {data.standings.map((s) => (
                <tr key={s.userId}>
                  <td className="tnum px-4 py-3 font-mono text-xs text-[var(--muted)]">#{s.rank}</td>
                  <td className="px-4 py-3">
                    <Link href={`/u/${s.userId}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-[var(--muted)] md:table-cell">
                    {s.institutionShortName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RatingBadge rating={s.rating} />
                  </td>
                  <td
                    className={`tnum px-4 py-3 text-right font-mono font-semibold ${
                      s.ratingGain > 0 ? "text-[var(--accent)]" : s.ratingGain < 0 ? "text-[var(--danger)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {s.ratingGain > 0 ? "+" : ""}
                    {s.ratingGain}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono text-xs text-[var(--muted)]">{s.solved}</td>
                </tr>
              ))}
              {data.standings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-[var(--muted)]">
                    No standings yet — the season hasn&apos;t closed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
