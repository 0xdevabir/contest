import { prisma } from "./db";
import { tierFor } from "./rating/tiers";

/** D3 — three leaderboards sharing one query shape. `national` requires
 * verified institution membership (the anti-fraud gate); `institution` and
 * `department` narrow the same pool to one campus / one campus+department. */
export type RatingLeaderboardScope = "national" | "institution" | "department";
export type RatingLeaderboardMetric = "rating" | "solved" | "contests";
/** "30d" ranks by rating *gain* over the trailing 30 days rather than the
 * absolute number — the doc's "most improved" surface, generalised beyond
 * season boundaries. */
export type RatingLeaderboardRange = "all" | "30d";

export type RatingLeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  institutionId: string | null;
  institutionShortName: string | null;
  department: string | null;
  rating: number;
  gain: number | null;
  tierKey: string;
  tierLabel: string;
  contests: number;
  peak: number;
};

export type RatingLeaderboardResult = {
  rows: RatingLeaderboardRow[];
  total: number;
  viewer: RatingLeaderboardRow | null;
};

export async function getRatingLeaderboard(opts: {
  scope: RatingLeaderboardScope;
  institutionId?: string;
  department?: string;
  metric?: RatingLeaderboardMetric;
  range?: RatingLeaderboardRange;
  limit?: number;
  cursor?: number;
  viewerId?: string;
}): Promise<RatingLeaderboardResult> {
  const metric = opts.metric ?? "rating";
  const range = opts.range ?? "all";
  const limit = opts.limit ?? 100;
  const cursor = opts.cursor ?? 0;

  const userWhere: Record<string, unknown> = {
    status: "ACTIVE",
    institutionVerifiedAt: { not: null },
  };
  if (opts.scope !== "national") {
    if (!opts.institutionId) return { rows: [], total: 0, viewer: null };
    userWhere.institutionId = opts.institutionId;
  }
  if (opts.scope === "department") {
    if (!opts.department) return { rows: [], total: 0, viewer: null };
    userWhere.department = opts.department;
  }

  const users = await prisma.user.findMany({
    where: { ...userWhere, rating: { isNot: null } },
    select: {
      id: true,
      name: true,
      institutionId: true,
      department: true,
      institution: { select: { shortName: true } },
      rating: { select: { displayed: true, contests: true, peak: true } },
    },
  });

  let gainByUser = new Map<string, number>();
  if (range === "30d") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const events = await prisma.ratingEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: users.map((u) => u.id) }, createdAt: { gte: since } },
      _sum: { delta: true },
    });
    gainByUser = new Map(events.map((e) => [e.userId, e._sum.delta ?? 0]));
  }

  const withSolved =
    metric === "solved"
      ? new Map(
          (
            await prisma.solvedProblem.groupBy({
              by: ["userId"],
              where: { userId: { in: users.map((u) => u.id) } },
              _count: { problemId: true },
            })
          ).map((g) => [g.userId, g._count.problemId])
        )
      : null;

  let rows: RatingLeaderboardRow[] = users.map((u) => {
    const tier = tierFor(u.rating!.displayed);
    return {
      rank: 0,
      userId: u.id,
      name: u.name,
      institutionId: u.institutionId,
      institutionShortName: u.institution?.shortName ?? null,
      department: u.department,
      rating: u.rating!.displayed,
      gain: range === "30d" ? gainByUser.get(u.id) ?? 0 : null,
      tierKey: tier.key,
      tierLabel: tier.label,
      contests: u.rating!.contests,
      peak: u.rating!.peak,
    };
  });

  if (range === "30d") {
    rows = rows.filter((r) => (r.gain ?? 0) !== 0);
    rows.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));
  } else if (metric === "solved" && withSolved) {
    rows.sort((a, b) => (withSolved.get(b.userId) ?? 0) - (withSolved.get(a.userId) ?? 0));
  } else if (metric === "contests") {
    rows.sort((a, b) => b.contests - a.contests || b.rating - a.rating);
  } else {
    rows.sort((a, b) => b.rating - a.rating);
  }

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const page = ranked.slice(cursor, cursor + limit);
  const viewerRow = opts.viewerId ? ranked.find((r) => r.userId === opts.viewerId) ?? null : null;
  const viewerVisible = viewerRow ? page.some((r) => r.userId === viewerRow.userId) : false;

  return { rows: page, total: ranked.length, viewer: viewerVisible ? null : viewerRow };
}

export type InstitutionRatingRow = {
  rank: number;
  institutionId: string;
  slug: string;
  name: string;
  shortName: string;
  verifiedMemberCount: number;
  aggregateRating: number;
  topMembers: { userId: string; name: string; rating: number }[];
};

/**
 * D3's network-effect lever: universities ranked by the sum of their top-10
 * verified members' ratings. Requires the institution itself to be verified
 * and to have at least 10 verified members — a small or unverified campus
 * simply isn't listed rather than shown at the bottom.
 */
export async function getInstitutionRatingLeaderboard(): Promise<InstitutionRatingRow[]> {
  const institutions = await prisma.institution.findMany({
    where: { verified: true },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      users: {
        where: { status: "ACTIVE", institutionVerifiedAt: { not: null } },
        select: { id: true, name: true, rating: { select: { displayed: true } } },
      },
    },
  });

  const rows: InstitutionRatingRow[] = [];
  for (const inst of institutions) {
    if (inst.users.length < 10) continue;
    const ranked = inst.users
      .map((u) => ({ userId: u.id, name: u.name, rating: u.rating?.displayed ?? 0 }))
      .sort((a, b) => b.rating - a.rating);
    const top10 = ranked.slice(0, 10);
    rows.push({
      rank: 0,
      institutionId: inst.id,
      slug: inst.slug,
      name: inst.name,
      shortName: inst.shortName,
      verifiedMemberCount: inst.users.length,
      aggregateRating: top10.reduce((sum, u) => sum + u.rating, 0),
      topMembers: top10,
    });
  }

  rows.sort((a, b) => b.aggregateRating - a.aggregateRating);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
