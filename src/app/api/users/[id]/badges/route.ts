import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertRatingsEnabled } from "@/lib/ratings-flag";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Props) {
  try {
    const { id } = await params;
    const session = await getSession().catch(() => null);
    await assertRatingsEnabled(session);

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, profilePublic: true } });
    if (!user) throw new NotFoundError("User not found");
    const isOwnerOrAdmin = session && (session.id === id || session.role === "ADMIN");
    if (!user.profilePublic && !isOwnerOrAdmin) throw new NotFoundError("User not found");

    const [awards, streak] = await Promise.all([
      prisma.userBadge.findMany({
        where: { userId: id, badge: { hidden: false } },
        include: { badge: true },
        orderBy: { earnedAt: "desc" },
      }),
      prisma.userStreak.findUnique({ where: { userId: id } }),
    ]);

    return NextResponse.json({
      ok: true,
      badges: awards.map((a) => ({
        code: a.badge.code,
        name: a.badge.name,
        description: a.badge.description,
        icon: a.badge.icon,
        tier: a.badge.tier,
        earnedAt: a.earnedAt,
        context: a.context,
      })),
      streak: streak ? { current: streak.current, longest: streak.longest, freezes: streak.freezes } : null,
    });
  } catch (err) {
    return toResponse(err);
  }
}
