import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { getHeatmap } from "@/lib/analytics/cohort";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Student x problem grid — `?assignmentId=` scopes to one assignment. */
export async function GET(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    await assertAnalyticsEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const assignmentId = new URL(req.url).searchParams.get("assignmentId") ?? undefined;
    const heatmap = await getHeatmap(id, { assignmentId });
    return NextResponse.json({ ok: true, heatmap });
  } catch (err) {
    return toResponse(err);
  }
}
