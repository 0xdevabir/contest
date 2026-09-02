export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getPracticeLeaderboard } from "@/lib/leaderboard";
import { PageHeader } from "@/components/PageHeader";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const institution = await prisma.institution.findUnique({ where: { slug } });
  if (!institution) {
    return { title: "Institution not found", robots: { index: false, follow: false } };
  }
  return buildPageMetadata({
    title: `${institution.name} — C programming leaderboard`,
    description: `Top verified C programmers at ${institution.name} on DIU ContestHub, ranked by problems solved.`,
    path: `/institutions/${slug}`,
    keywords: [`${institution.name} programming`, `${institution.shortName} coding leaderboard`],
  });
}

export default async function InstitutionProfilePage({ params }: Props) {
  const { slug } = await params;
  const institution = await prisma.institution.findUnique({ where: { slug } });
  if (!institution) notFound();

  const board = await getPracticeLeaderboard({
    institutionId: institution.id,
    verifiedOnly: true,
    limit: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Institutions", path: "/institutions" },
          { name: institution.name, path: `/institutions/${slug}` },
        ])}
      />
      <PageHeader
        eyebrow={institution.verified ? "Verified institution" : "Unverified institution"}
        title={institution.name}
        lead={[institution.district, institution.division].filter(Boolean).join(", ") || undefined}
        actions={
          institution.websiteUrl ? (
            <a
              href={institution.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost !py-2 !text-xs"
            >
              Official site
            </a>
          ) : null
        }
      />

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="panel px-4 py-3.5">
          <p className="eyebrow">Verified solvers</p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold">{board.stats.solvers}</p>
        </div>
        <div className="panel px-4 py-3.5">
          <p className="eyebrow">Total solves</p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold">{board.stats.totalSolves}</p>
        </div>
        <div className="panel px-4 py-3.5">
          <p className="eyebrow">Active this week</p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold">{board.stats.activeThisWeek}</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Top solvers</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Verified members only — {institution.name} students who confirmed their institutional
          email or were approved by an admin.
        </p>
        <div className="panel mt-4 overflow-hidden">
          {board.rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Trophy className="mx-auto text-[var(--muted-dim)]" size={26} aria-hidden />
              <p className="mt-3 text-sm text-[var(--muted)]">No verified solvers yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line-soft)]">
              {board.rows.map((row) => (
                <li key={row.userId}>
                  <Link
                    href={`/u/${row.userId}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--hover)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="tnum w-6 shrink-0 font-mono text-xs text-[var(--muted-dim)]">
                        {row.rank}
                      </span>
                      <span className="truncate font-medium">{row.name}</span>
                      <ShieldCheck size={12} className="shrink-0 text-[var(--accent)]" aria-hidden />
                    </div>
                    <span className="tnum shrink-0 font-mono text-xs text-[var(--muted)]">
                      {row.solved} solved
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
