import { prisma } from "../db";

/** Shared by GET /api/admin/ai/usage and the /admin/costs page — one query
 * shape, one place that changes if the reporting needs grow. */
export async function getAiUsageSummary() {
  const [byKindStatus, budgets, reviewed, accepted] = await Promise.all([
    prisma.aiJob.groupBy({
      by: ["kind", "status"],
      _count: true,
      _sum: { costCents: true, inputTokens: true, outputTokens: true, cachedTokens: true },
    }),
    prisma.aiBudget.findMany(),
    prisma.aiJob.count({ where: { accepted: { not: null } } }),
    prisma.aiJob.count({ where: { accepted: true } }),
  ]);

  const totalCostCents = byKindStatus.reduce((s, r) => s + (r._sum.costCents ?? 0), 0);

  return {
    totalCostCents,
    acceptanceRate: reviewed > 0 ? accepted / reviewed : null,
    byKindStatus: byKindStatus.map((r) => ({
      kind: r.kind,
      status: r.status,
      count: r._count,
      costCents: r._sum.costCents ?? 0,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      cachedTokens: r._sum.cachedTokens ?? 0,
    })),
    budgets: budgets.map((b) => ({
      institutionId: b.institutionId,
      monthlyCents: b.monthlyCents,
      usedCents: b.usedCents,
      periodStart: b.periodStart,
      hardStop: b.hardStop,
    })),
  };
}
