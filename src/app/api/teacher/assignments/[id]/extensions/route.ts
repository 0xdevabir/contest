import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { invalidateGradebookCache } from "@/lib/gradebook";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  userId: z.string(),
  newDueAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

/** A per-student deadline extension — teacher or TA (D5). */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;

    const assignment = await prisma.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundError("Assignment not found");
    if (!session) throw new AuthError();
    await assertSectionStaff(session, assignment.sectionId);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid extension data", parsed.error.flatten());
    const data = parsed.data;

    const enrolled = await prisma.enrollment.findFirst({
      where: { sectionId: assignment.sectionId, userId: data.userId, status: "ACTIVE" },
    });
    if (!enrolled) throw new ValidationError("That student is not enrolled in this section");

    const extension = await prisma.assignmentExtension.upsert({
      where: { assignmentId_userId: { assignmentId: id, userId: data.userId } },
      update: { newDueAt: new Date(data.newDueAt), reason: data.reason ?? "", grantedById: session.id },
      create: {
        assignmentId: id,
        userId: data.userId,
        newDueAt: new Date(data.newDueAt),
        reason: data.reason ?? "",
        grantedById: session.id,
      },
    });

    invalidateGradebookCache(assignment.sectionId);

    await recordAdminAction({
      actorId: session.id,
      action: "assignment.extension",
      targetType: "ASSIGNMENT",
      targetId: id,
      details: { userId: data.userId, newDueAt: data.newDueAt },
    });

    return NextResponse.json({ ok: true, extension });
  } catch (err) {
    return toResponse(err);
  }
}
