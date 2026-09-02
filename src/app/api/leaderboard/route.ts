import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertRatingsEnabled } from "@/lib/ratings-flag";
import {
  getRatingLeaderboard,
  type RatingLeaderboardMetric,
  type RatingLeaderboardRange,
  type RatingLeaderboardScope,
} from "@/lib/rating-leaderboard";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseScope(v: string | null): RatingLeaderboardScope {
  return v === "institution" || v === "department" ? v : "national";
}
function parseMetric(v: string | null): RatingLeaderboardMetric {
  return v === "solved" || v === "contests" ? v : "rating";
}
function parseRange(v: string | null): RatingLeaderboardRange {
  return v === "30d" ? "30d" : "all";
}

/** Public rating leaderboard — national / institution / department scopes,
 * docs/phases/PHASE-09-ratings-leaderboards.md D3. */
export async function GET(req: Request) {
  try {
    const session = await getSession().catch(() => null);
    await assertRatingsEnabled(session);

    const url = new URL(req.url);
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
    const result = await getRatingLeaderboard({
      scope: parseScope(url.searchParams.get("scope")),
      institutionId: url.searchParams.get("institutionId") ?? undefined,
      department: url.searchParams.get("department") ?? undefined,
      metric: parseMetric(url.searchParams.get("metric")),
      range: parseRange(url.searchParams.get("range")),
      cursor,
      limit: 100,
      viewerId: session?.id,
    });

    return NextResponse.json({ ok: true, ...result, nextCursor: cursor + result.rows.length < result.total ? cursor + 100 : null });
  } catch (err) {
    return toResponse(err);
  }
}
