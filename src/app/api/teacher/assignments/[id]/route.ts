import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { invalidateGradebookCache } from "@/lib/gradebook";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, ValidationError, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const problemPatchSchema = z.object({
  id: z.string().optional(), // existing AssignmentProblem id, when reordering/re-pointing
  problemSlug: z.string().optional(),
  points: z.number().int().min(1).max(1000),
  required: z.boolean().default(true),
  order: z.number().int().min(0),
});

const patchSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  descriptionMd: z.string().max(20000).optional(),
  opensAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  latePolicy: z.enum(["NONE", "LINEAR", "GRACE_THEN_LINEAR", "REJECT"]).optional(),
  lateParam: z.number().min(0).max(1000).optional(),
  weight: z.number().min(0).max(100).optional(),
  showPeers: z.boolean().optional(),
  published: z.boolean().optional(),
  problems: z.array(problemPatchSchema).optional(),
});

/** Publish, edit, reorder problems — teacher only (D5: TA cannot publish or change weights). */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id } = await params;

    const existing = await prisma.assignment.findUnique({ where: { id }, include: { problems: true, column: true } });
    if (!existing) throw new NotFoundError("Assignment not found");
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, existing.sectionId);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid assignment update", parsed.error.flatten());
    const data = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.update({
        where: { id },
        data: {
          title: data.title,
          descriptionMd: data.descriptionMd,
          opensAt: data.opensAt === undefined ? undefined : data.opensAt ? new Date(data.opensAt) : null,
          dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
          closesAt: data.closesAt === undefined ? undefined : data.closesAt ? new Date(data.closesAt) : null,
          latePolicy: data.latePolicy,
          lateParam: data.lateParam,
          weight: data.weight,
          showPeers: data.showPeers,
          published: data.published,
        },
        include: { problems: true },
      });

      if (data.problems) {
        for (const p of data.problems) {
          if (!p.id) continue;
          await tx.assignmentProblem.update({
            where: { id: p.id },
            data: { points: p.points, required: p.required, order: p.order },
          });
        }
      }

      if (existing.column && (data.weight !== undefined || data.title !== undefined || data.published !== undefined || data.problems)) {
        const totalPoints = data.problems
          ? data.problems.reduce((s, p) => s + p.points, 0)
          : existing.problems.reduce((s, p) => s + p.points, 0);
        await tx.gradebookColumn.update({
          where: { id: existing.column.id },
          data: {
            title: data.title ?? undefined,
            weight: data.weight ?? undefined,
            maxPoints: totalPoints || undefined,
            // Publishing the assignment is what surfaces its grades — mirror
            // that onto the column so a rejudge/regrade doesn't need a
            // separate "publish this column" step.
            published: data.published ?? undefined,
          },
        });
      }

      return assignment;
    });

    invalidateGradebookCache(existing.sectionId);

    await recordAdminAction({
      actorId: session.id,
      action: "assignment.update",
      targetType: "ASSIGNMENT",
      targetId: id,
      details: data,
    });

    return NextResponse.json({ ok: true, assignment: updated });
  } catch (err) {
    return toResponse(err);
  }
}
