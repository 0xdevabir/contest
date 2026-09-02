import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { getStudentDeepDive } from "@/lib/analytics/student";
import { toResponse, AuthError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; uid: string }> };

/** Teacher/TA deep dive for one enrolled student. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    await assertAnalyticsEnabled(session);
    const { id, uid } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const student = await getStudentDeepDive(id, uid);
    if (!student) throw new NotFoundError("Student not found in this section");
    return NextResponse.json({ ok: true, student });
  } catch (err) {
    return toResponse(err);
  }
}
