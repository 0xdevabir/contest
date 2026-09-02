export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { getInstitutionRatingLeaderboard } from "@/lib/rating-leaderboard";
import { PageHeader } from "@/components/PageHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Institution leaderboard — DIU ContestHub",
  description: "Universities ranked by the combined rating of their top 10 verified members.",
  path: "/leaderboard/institutions",
});

export default async function InstitutionLeaderboardPage() {
  const session = await getSession().catch(() => null);
  const on = await isEnabled("ratings", session ? { userId: session.id, role: session.role } : undefined);
  if (!on) notFound();

  const rows = await getInstitutionRatingLeaderboard();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Standings"
        title="Institution leaderboard"
        lead="Universities ranked by the sum of their top 10 verified members' ratings. A campus needs at least 10 verified members to appear."
      />

      <div className="panel mt-7 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-[var(--line)]">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
                <th className="eyebrow w-12">#</th>
                <th className="eyebrow">Institution</th>
                <th className="eyebrow text-right">Verified members</th>
                <th className="eyebrow text-right">Top-10 aggregate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {rows.map((r) => (
                <tr key={r.institutionId}>
                  <td className="tnum px-4 py-3 font-mono text-xs text-[var(--muted)]">#{r.rank}</td>
                  <td className="px-4 py-3">
                    <Link href={`/leaderboard/rating?scope=institution&institution=${r.institutionId}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {r.topMembers
                        .slice(0, 3)
                        .map((m) => m.name)
                        .join(", ")}
                    </p>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono text-xs text-[var(--muted)]">{r.verifiedMemberCount}</td>
                  <td className="tnum px-4 py-3 text-right font-mono font-semibold">{r.aggregateRating.toLocaleString()}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-14 text-center text-sm text-[var(--muted)]">
                    No institution has 10 verified rated members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-xs text-[var(--muted-dim)]">
        Methodology: the sum of each institution&apos;s 10 highest-rated verified members — not the average — so a large
        campus can&apos;t be dragged down by inactive accounts and a small one can&apos;t win on a single strong student.
      </p>
    </div>
  );
}
