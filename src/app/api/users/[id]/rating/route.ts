import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertRatingsEnabled } from "@/lib/ratings-flag";
import { tierFor } from "@/lib/rating/tiers";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** Current rating + full history for a user's profile graph. Respects
 * `profilePublic` the same way /u/[id] does — a private profile 404s to
 * strangers, but the owner (and an admin) can always see it. */
export async function GET(_req: Request, { params }: Props) {
  try {
    const { id } = await params;
    const session = await getSession().catch(() => null);
    await assertRatingsEnabled(session);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, profilePublic: true },
    });
    if (!user) throw new NotFoundError("User not found");
    const isOwnerOrAdmin = session && (session.id === id || session.role === "ADMIN");
    if (!user.profilePublic && !isOwnerOrAdmin) throw new NotFoundError("User not found");

    const [rating, events] = await Promise.all([
      prisma.userRating.findUnique({ where: { userId: id } }),
      prisma.ratingEvent.findMany({
        where: { userId: id },
        orderBy: { createdAt: "asc" },
        include: { contest: { select: { title: true, slug: true } } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      rating: rating
        ? { displayed: rating.displayed, peak: rating.peak, contests: rating.contests, tier: tierFor(rating.displayed) }
        : null,
      history: events.map((e) => ({
        contestId: e.contestId,
        contestTitle: e.contest.title,
        contestSlug: e.contest.slug,
        rank: e.rank,
        ratedCount: e.ratedCount,
        displayedBefore: e.displayedBefore,
        displayedAfter: e.displayedAfter,
        delta: e.delta,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    return toResponse(err);
  }
}
