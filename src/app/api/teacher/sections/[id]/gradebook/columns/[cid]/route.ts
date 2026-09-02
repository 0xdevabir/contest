import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertClassroomEnabled } from "@/lib/classroom-flag";
import { assertSectionTeacher } from "@/lib/section-access";
import { invalidateGradebookCache } from "@/lib/gradebook";
import { toResponse, ValidationError, NotFoundError, AuthError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; cid: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  weight: z.number().min(0).max(100).optional(),
  maxPoints: z.number().min(1).max(10000).optional(),
  published: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

/** Weight/publish/title edits — teacher only (D5: never delegated to a TA). */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertClassroomEnabled(session);
    const { id, cid } = await params;
    if (!session) throw new AuthError();
    await assertSectionTeacher(session, id);

    const column = await prisma.gradebookColumn.findUnique({ where: { id: cid } });
    if (!column || column.sectionId !== id) throw new NotFoundError("Column not found");

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid column update", parsed.error.flatten());

    const updated = await prisma.gradebookColumn.update({ where: { id: cid }, data: parsed.data });
    invalidateGradebookCache(id);
    return NextResponse.json({ ok: true, column: updated });
  } catch (err) {
    return toResponse(err);
  }
}
