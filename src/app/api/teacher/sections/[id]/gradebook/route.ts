import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { computeGradebookCached } from "@/lib/gradebook";
import { toResponse, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** The computed grid — teacher or TA. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const gradebook = await computeGradebookCached(id);
    return NextResponse.json({ ok: true, ...gradebook });
  } catch (err) {
    return toResponse(err);
  }
}
