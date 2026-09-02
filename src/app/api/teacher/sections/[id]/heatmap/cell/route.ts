import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { getCellSubmissions } from "@/lib/analytics/cohort";
import { toResponse, AuthError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** D3 — cell click side panel: this student's submissions for this problem. */
export async function GET(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    await assertAnalyticsEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const problemId = url.searchParams.get("problemId");
    if (!userId || !problemId) throw new ValidationError("userId and problemId are required");

    const submissions = await getCellSubmissions(id, userId, problemId);
    return NextResponse.json({ ok: true, submissions });
  } catch (err) {
    return toResponse(err);
  }
}
