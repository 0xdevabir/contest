import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; eid: string }> };

const patchSchema = z.object({
  role: z.enum(["STUDENT", "TA"]).optional(),
  status: z.enum(["INVITED", "ACTIVE", "DROPPED"]).optional(),
});

/** Role change, drop, or re-invite (status back to INVITED). Teacher only — D5. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id, eid } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid enrollment update", parsed.error.flatten());

    const enrollment = await prisma.enrollment.findUnique({ where: { id: eid } });
    if (!enrollment || enrollment.sectionId !== id) throw new NotFoundError("Enrollment not found");

    const data: Record<string, unknown> = {};
    if (parsed.data.role) data.role = parsed.data.role;
    if (parsed.data.status) {
      data.status = parsed.data.status;
      if (parsed.data.status === "DROPPED") data.droppedAt = new Date();
      if (parsed.data.status === "ACTIVE" && enrollment.status !== "ACTIVE") data.joinedAt = new Date();
    }

    const updated = await prisma.enrollment.update({ where: { id: eid }, data });

    await recordAdminAction({
      actorId: session.id,
      action: "enrollment.update",
      targetType: "ENROLLMENT",
      targetId: eid,
      details: parsed.data,
    });

    return NextResponse.json({ ok: true, enrollment: updated });
  } catch (err) {
    return toResponse(err);
  }
}
