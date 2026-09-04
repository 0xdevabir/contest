export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { ModerationQueue } from "@/components/admin/ModerationQueue";

export default async function AdminModerationPage() {
  const reports = await prisma.contentReport.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const reporters = await prisma.user.findMany({
    where: { id: { in: reports.map((r) => r.reporterId) } },
    select: { id: true, name: true, email: true },
  });
  const reporterById = new Map(reporters.map((u) => [u.id, u]));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Community</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Moderation queue</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {reports.length} open report{reports.length === 1 ? "" : "s"} awaiting review.
        </p>
      </header>

      <div className="mt-7">
        <ModerationQueue
          initial={reports.map((r) => ({
            id: r.id,
            target: r.target,
            targetId: r.targetId,
            reason: r.reason,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            reporter: reporterById.get(r.reporterId) ?? null,
          }))}
        />
      </div>
    </div>
  );
}
