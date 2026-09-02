import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { getTagMastery, getActivityTimeline } from "@/lib/analytics/student";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * The student's own view of the same rollups a teacher sees for them —
 * "surveillance into feedback" (PHASE-08 Risks). Powers /profile/insights.
 */
export async function GET() {
  try {
    const session = await getSession();
    await assertAnalyticsEnabled(session);
    if (!session) throw new AuthError();

    const [tagMastery, timeline] = await Promise.all([
      getTagMastery(session.id),
      getActivityTimeline(session.id),
    ]);

    const weakest = [...tagMastery].sort((a, b) => a.mastery - b.mastery).slice(0, 5);
    const streak = computeStreak(timeline);

    return NextResponse.json({ ok: true, tagMastery, timeline, weakest, streak });
  } catch (err) {
    return toResponse(err);
  }
}

function computeStreak(timeline: { day: string; submitted: number }[]): number {
  let streak = 0;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].submitted > 0) streak++;
    else break;
  }
  return streak;
}
