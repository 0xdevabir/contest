import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { getSectionSummary } from "@/lib/analytics/cohort";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Summary + weak tags + at-risk — teacher or TA of the section only. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    await assertAnalyticsEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const summary = await getSectionSummary(id);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return toResponse(err);
  }
}
