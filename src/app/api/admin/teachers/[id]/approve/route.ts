import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { recordAdminAction } from "@/lib/admin-audit";
import { notify } from "@/lib/notify";
import { toResponse, ValidationError, NotFoundError, ConflictError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ note: z.string().trim().max(500).optional() });

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "teacher:approve");
    const { id } = await params;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine */
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid request");

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundError("User not found");
    if (target.role !== "TEACHER") throw new ConflictError("This account is not a teacher signup");

    await prisma.user.update({
      where: { id },
      data: { teacherApprovedAt: new Date(), teacherApprovedBy: session!.id },
    });

    await recordAdminAction({
      actorId: session!.id,
      action: "TEACHER_APPROVED",
      targetType: "USER",
      targetId: id,
      details: { email: target.email, note: parsed.data.note ?? "" },
    });

    // Phase 11 — routed through notify() so it's the single source of this
    // email (its EMAIL channel special-cases "teacher:approved" to reuse
    // the branded sendTeacherApprovedEmail template) plus an in-app row.
    await notify(id, "teacher:approved", {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
