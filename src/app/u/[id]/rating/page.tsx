export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEnabled } from "@/lib/flags";
import { PageHeader } from "@/components/PageHeader";
import { RatingBadge } from "@/components/RatingBadge";
import { RatingGraph } from "@/components/rating/RatingGraph";
import { tierFor } from "@/lib/rating/tiers";
import { buildPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return buildPageMetadata({ title: "Rating history", path: `/u/${id}/rating`, description: "Per-contest rating deltas." });
}

export default async function UserRatingHistoryPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession().catch(() => null);
  const on = await isEnabled("ratings", session ? { userId: session.id, role: session.role } : undefined);
  if (!on) notFound();

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, profilePublic: true, institution: { select: { shortName: true } } },
  });
  if (!user) notFound();
  const isOwnerOrAdmin = session && (session.id === id || session.role === "ADMIN");
  if (!user.profilePublic && !isOwnerOrAdmin) notFound();

  const [rating, events] = await Promise.all([
    prisma.userRating.findUnique({ where: { userId: id } }),
    prisma.ratingEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: { contest: { select: { title: true, slug: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow={user.institution?.shortName ?? "Unaffiliated"}
        title={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            {user.name}
            {rating ? <RatingBadge rating={rating.displayed} size="md" showLabel /> : null}
          </span>
        }
        lead="Every rated contest and the delta it produced, oldest first on the graph and newest first below."
        actions={
          <Link href={`/u/${id}`} className="btn !py-2 !text-xs">
            ← Back to profile
          </Link>
        }
      />

      {rating && events.length > 0 ? (
        <div className="panel mt-7 p-5">
          <RatingGraph
            history={[...events].reverse().map((e) => ({
              contestTitle: e.contest.title,
              displayedAfter: e.displayedAfter,
              createdAt: e.createdAt,
            }))}
          />
        </div>
      ) : null}

      <div className="panel mt-5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-[var(--line)]">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
                <th className="eyebrow">Contest</th>
                <th className="eyebrow text-right">Rank</th>
                <th className="eyebrow text-right">Rating</th>
                <th className="eyebrow text-right">Delta</th>
                <th className="eyebrow text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {events.map((e) => (
                <tr key={e.contestId}>
                  <td className="px-4 py-3">
                    <Link href={`/contests/${e.contest.slug}`} className="hover:underline">
                      {e.contest.title}
                    </Link>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono text-xs text-[var(--muted)]">
                    {e.rank}/{e.ratedCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span style={{ color: `var(--tier-${tierFor(e.displayedAfter).key})` }} className="tnum font-mono font-semibold">
                      {e.displayedAfter}
                    </span>
                  </td>
                  <td
                    className={`tnum px-4 py-3 text-right font-mono font-semibold ${
                      e.delta > 0 ? "text-[var(--accent)]" : e.delta < 0 ? "text-[var(--danger)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {e.delta > 0 ? "+" : ""}
                    {e.delta}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono text-xs text-[var(--muted)]">
                    {e.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                    No rated contests yet.
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
