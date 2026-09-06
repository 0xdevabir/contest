export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Institutions — Bangladeshi universities on CodeHub",
  description:
    "Browse every institution ranked on CodeHub's national leaderboard — public and private universities, polytechnics, and colleges across Bangladesh.",
  path: "/institutions",
  keywords: ["Bangladesh university programming ranking", "institution leaderboard", "CS department ranking Bangladesh"],
});

export default async function InstitutionsPage() {
  const [institutions, memberCounts] = await Promise.all([
    prisma.institution.findMany({
      where: { verified: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, slug: true, name: true, shortName: true, district: true },
    }),
    // memberCount/solvedCount on Institution are denormalised counters
    // refreshed by Phase 9's nightly job, which doesn't exist yet — count live.
    prisma.user.groupBy({
      by: ["institutionId"],
      where: { institutionId: { not: null }, status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);
  const countById = new Map(memberCounts.map((g) => [g.institutionId, g._count._all]));
  const ranked = institutions
    .map((inst) => ({ ...inst, memberCount: countById.get(inst.id) ?? 0 }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Institutions", path: "/institutions" },
        ])}
      />
      <PageHeader
        eyebrow="National board"
        title="Institutions"
        lead={`${ranked.length} verified institutions ranked by members. This is the foundation of the national leaderboard.`}
      />

      <div className="panel mt-8 divide-y divide-[var(--line-soft)] overflow-hidden">
        {ranked.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[var(--muted)]">
            No verified institutions yet.
          </p>
        ) : (
          ranked.map((inst) => (
            <Link
              key={inst.id}
              href={`/institutions/${inst.slug}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--hover)]"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-display text-sm font-bold">
                  {inst.name}
                  <ShieldCheck size={13} className="shrink-0 text-[var(--accent)]" aria-hidden />
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                  {inst.shortName}
                  {inst.district ? ` · ${inst.district}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
                <Users size={13} aria-hidden />
                {inst.memberCount.toLocaleString()}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
