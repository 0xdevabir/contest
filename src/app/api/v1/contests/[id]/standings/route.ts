import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error } from "@/lib/v1/http";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import { contestCapabilities } from "@/lib/contest-access";
import { getContestLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/contests/{id}/standings — live (unfrozen) or a frozen
 * snapshot, matching the same freeze semantics the live standings page uses. */
export async function GET(req: Request, { params }: Params) {
  try {
    const key = await requireApiKey(req, "standings:read");
    const { id } = await params;

    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(key.owner, contest);
    if (!caps.has("view")) throw new ForbiddenError();

    const freezeMinutes = Number((contest.rules as Record<string, unknown> | null)?.freezeMinutes ?? 0);
    const freezeAt =
      freezeMinutes > 0 && contest.endsAt ? new Date(contest.endsAt.getTime() - freezeMinutes * 60_000) : null;
    const showFrozen = freezeAt != null && !caps.has("viewAllSubmissions") && contest.status === "LIVE";

    const standings = await getContestLeaderboard(id, { freezeAt: showFrozen ? freezeAt : null });

    return v1Data({
      contest_id: id,
      frozen: showFrozen,
      standings: standings.map((s) => ({
        rank: s.rank,
        user_id: s.userId,
        name: s.name,
        solved: s.solved,
        penalty: s.penalty,
        last_ac_at: s.lastAcAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return v1Error(err);
  }
}
