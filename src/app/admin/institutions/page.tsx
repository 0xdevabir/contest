export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { InstitutionAdminPanel } from "@/components/admin/InstitutionAdminPanel";

type Props = { searchParams: Promise<{ q?: string }> };

export default async function AdminInstitutionsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const where = q?.trim()
    ? {
        OR: [
          { name: { contains: q.trim(), mode: "insensitive" as const } },
          { shortName: { contains: q.trim(), mode: "insensitive" as const } },
          { slug: { contains: q.trim(), mode: "insensitive" as const } },
        ],
      }
    : {};

  const institutions = await prisma.institution.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      domains: { select: { id: true, domain: true, roleHint: true } },
      _count: { select: { users: true } },
    },
  });

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          People
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Institutions</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {institutions.length} institutions · CRUD and email-domain verification.
        </p>
      </header>

      <div className="mt-7">
        <InstitutionAdminPanel
          initial={institutions.map((i) => ({
            id: i.id,
            slug: i.slug,
            name: i.name,
            shortName: i.shortName,
            type: i.type,
            district: i.district,
            division: i.division,
            websiteUrl: i.websiteUrl,
            verified: i.verified,
            memberCount: i._count.users,
            domains: i.domains,
          }))}
        />
      </div>
    </div>
  );
}
