import { prisma } from "./db";
import { log } from "./log";
import { issueCertificate } from "./certificates";

export async function getSeasonStandings(slug: string) {
  const season = await prisma.season.findUnique({ where: { slug } });
  if (!season) return null;
  const standings = await prisma.seasonStanding.findMany({
    where: { seasonId: season.id },
    orderBy: { rank: "asc" },
  });
  const userIds = standings.map((s) => s.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, institution: { select: { shortName: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    season,
    standings: standings.map((s) => ({
      ...s,
      name: byId.get(s.userId)?.name ?? "Unknown",
      institutionShortName: byId.get(s.userId)?.institution?.shortName ?? null,
    })),
  };
}

/**
 * D4 — snapshot the final table for a season and award season badges
 * (top 1/3/10, most improved, most active). Ratings are never reset here —
 * only the archived per-season table is written.
 */
export async function closeSeason(seasonId: string): Promise<{ standings: number }> {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) throw new Error("Season not found");
  if (season.closedAt) return { standings: 0 };

  const userWhere: Record<string, unknown> = { status: "ACTIVE", institutionVerifiedAt: { not: null } };
  if (season.institutionId) userWhere.institutionId = season.institutionId;

  const users = await prisma.user.findMany({
    where: { ...userWhere, rating: { isNot: null } },
    select: { id: true, rating: { select: { displayed: true, contests: true } } },
  });

  const gains = await prisma.ratingEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, createdAt: { gte: season.startsAt, lte: season.endsAt } },
    _sum: { delta: true },
    _count: { _all: true },
  });
  const gainByUser = new Map(gains.map((g) => [g.userId, g._sum.delta ?? 0]));
  const contestsInSeasonByUser = new Map(gains.map((g) => [g.userId, g._count._all]));

  const solved = await prisma.solvedProblem.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, firstSolvedAt: { gte: season.startsAt, lte: season.endsAt } },
    _count: { problemId: true },
  });
  const solvedByUser = new Map(solved.map((s) => [s.userId, s._count.problemId]));

  const ranked = users
    .map((u) => ({
      userId: u.id,
      rating: u.rating!.displayed,
      ratingGain: gainByUser.get(u.id) ?? 0,
      solved: solvedByUser.get(u.id) ?? 0,
      contests: contestsInSeasonByUser.get(u.id) ?? 0,
    }))
    .filter((u) => u.contests > 0)
    .sort((a, b) => b.rating - a.rating);

  await prisma.$transaction(async (tx) => {
    await tx.seasonStanding.deleteMany({ where: { seasonId } });
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      await tx.seasonStanding.create({
        data: { seasonId, userId: r.userId, rank: i + 1, rating: r.rating, ratingGain: r.ratingGain, solved: r.solved, contests: r.contests },
      });
    }
    await tx.season.update({ where: { id: seasonId }, data: { closedAt: new Date() } });
  });

  await awardSeasonBadges(seasonId, ranked);

  if (ranked.length > 0) {
    const champion = ranked[0];
    await issueCertificate({
      type: "season_achievement",
      userId: champion.userId,
      payload: { seasonName: season.name, achievement: "Season Champion", rating: champion.rating },
    }).catch((err) => log.error("season certificate issuance failed", { seasonId }, err));
  }

  log.info("season closed", { seasonId, standings: ranked.length });
  return { standings: ranked.length };
}

async function awardSeasonBadges(
  seasonId: string,
  ranked: { userId: string; ratingGain: number; contests: number }[]
): Promise<void> {
  if (ranked.length === 0) return;
  const codes = {
    champion: "season-champion",
    top3: "season-top-3",
    top10: "season-top-10",
    mostImproved: "season-most-improved",
    mostActive: "season-most-active",
  };
  const badges = await prisma.badge.findMany({ where: { code: { in: Object.values(codes) } } });
  const byCode = new Map(badges.map((b) => [b.code, b.id]));

  const awardOnce = async (code: string, userId: string) => {
    const badgeId = byCode.get(code);
    if (!badgeId) return;
    await prisma.userBadge.create({ data: { userId, badgeId, context: { seasonId } } }).catch(() => undefined);
  };

  for (let i = 0; i < Math.min(1, ranked.length); i++) await awardOnce(codes.champion, ranked[i].userId);
  for (let i = 0; i < Math.min(3, ranked.length); i++) await awardOnce(codes.top3, ranked[i].userId);
  for (let i = 0; i < Math.min(10, ranked.length); i++) await awardOnce(codes.top10, ranked[i].userId);

  const mostImproved = [...ranked].sort((a, b) => b.ratingGain - a.ratingGain)[0];
  if (mostImproved && mostImproved.ratingGain > 0) await awardOnce(codes.mostImproved, mostImproved.userId);

  const mostActive = [...ranked].sort((a, b) => b.contests - a.contests)[0];
  if (mostActive) await awardOnce(codes.mostActive, mostActive.userId);
}
