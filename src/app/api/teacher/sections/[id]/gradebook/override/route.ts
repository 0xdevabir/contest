import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionStaff } from "@/lib/section-access";
import { invalidateGradebookCache } from "@/lib/gradebook";
import { recordAdminAction } from "@/lib/admin-audit";
import { notify } from "@/lib/notify";
import { toResponse, ValidationError, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  columnId: z.string(),
  userId: z.string(),
  points: z.number(),
  reason: z.string().max(500).optional(),
});

/** Teacher or TA — an override never touches weights or publish state. */
export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();
    await assertSectionStaff(session, id);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid override data", parsed.error.flatten());
    const data = parsed.data;

    const column = await prisma.gradebookColumn.findUnique({ where: { id: data.columnId } });
    if (!column || column.sectionId !== id) throw new NotFoundError("Column not found");
    const enrolled = await prisma.enrollment.findFirst({ where: { sectionId: id, userId: data.userId, status: "ACTIVE" } });
    if (!enrolled) throw new ValidationError("That student is not enrolled in this section");

    const override = await prisma.gradeOverride.upsert({
      where: { columnId_userId: { columnId: data.columnId, userId: data.userId } },
      update: { points: data.points, reason: data.reason ?? "", authorId: session.id },
      create: {
        columnId: data.columnId,
        userId: data.userId,
        points: data.points,
        reason: data.reason ?? "",
        authorId: session.id,
      },
    });

    invalidateGradebookCache(id);

    await recordAdminAction({
      actorId: session.id,
      action: "gradebook.override",
      targetType: "GRADEBOOK",
      targetId: data.columnId,
      details: { userId: data.userId, points: data.points },
    });

    notify(data.userId, "assignment:graded", {
      assignmentTitle: column.title,
      points: data.points,
      sectionId: id,
      assignmentId: column.assignmentId,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, override });
  } catch (err) {
    return toResponse(err);
  }
}
