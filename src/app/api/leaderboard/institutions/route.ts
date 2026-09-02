import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertRatingsEnabled } from "@/lib/ratings-flag";
import { getInstitutionRatingLeaderboard } from "@/lib/rating-leaderboard";
import { toResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** University-vs-university table — D3's network-effect lever. */
export async function GET() {
  try {
    const session = await getSession().catch(() => null);
    await assertRatingsEnabled(session);
    const rows = await getInstitutionRatingLeaderboard();
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    return toResponse(err);
  }
}
