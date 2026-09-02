import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isApprovedTeacher } from "@/lib/authz";
import { toResponse, AuthError, ForbiddenError } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * D — a coach's persistent squads (`Team.contestId === null`) plus, per
 * squad, the contests its current members have competed in as a team
 * (docs/phases/PHASE-07-live-contest.md). Squad membership and per-contest
 * team membership are deliberately independent rows — a squad is a roster a
 * coach maintains across seasons, a contest Team is what actually scores —
 * so "history" here is derived by following each squad member's own
 * contest-team participations, not a stored link between the two.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AuthError();
    if (!isApprovedTeacher(session) && session.role !== "ADMIN") throw new ForbiddenError();

    const squads = await prisma.team.findMany({
      where: { coachId: session.id, contestId: null },
      orderBy: { createdAt: "desc" },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    const squadsWithHistory = await Promise.all(
      squads.map(async (squad) => {
        const memberIds = squad.members.map((m) => m.userId);
        const participations =
          memberIds.length === 0
            ? []
            : await prisma.contestParticipation.findMany({
                where: { userId: { in: memberIds }, teamId: { not: null }, mode: "LIVE" },
                select: {
                  contestId: true,
                  teamId: true,
                  contest: { select: { title: true, slug: true, status: true, endsAt: true } },
                },
                orderBy: { registeredAt: "desc" },
                take: 50,
              });

        const seen = new Set<string>();
        const history = participations.filter((p) => {
          const key = `${p.contestId}:${p.teamId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return {
          id: squad.id,
          name: squad.name,
          joinCode: squad.joinCode,
          members: squad.members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
          history: history.map((h) => ({
            contestId: h.contestId,
            title: h.contest.title,
            slug: h.contest.slug,
            status: h.contest.status,
            endsAt: h.contest.endsAt,
          })),
        };
      })
    );

    return NextResponse.json({ ok: true, squads: squadsWithHistory });
  } catch (err) {
    return toResponse(err);
  }
}
