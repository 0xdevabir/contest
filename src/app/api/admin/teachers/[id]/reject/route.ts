import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { recordAdminAction } from "@/lib/admin-audit";
import { sendTeacherRejectedEmail } from "@/lib/mail";
import { toResponse, ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { log } from "@/lib/log";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

/** Rejection demotes the account back to STUDENT rather than deleting it. */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "teacher:approve");
    const { id } = await params;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ValidationError("A reason is required");

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundError("User not found");
    if (target.role !== "TEACHER") throw new ConflictError("This account is not a teacher signup");

    await prisma.user.update({
      where: { id },
      data: {
        role: "STUDENT",
        teacherApprovedAt: null,
        teacherApprovedBy: null,
        teacherRequestNote: "",
      },
    });

    await recordAdminAction({
      actorId: session!.id,
      action: "TEACHER_REJECTED",
      targetType: "USER",
      targetId: id,
      details: { email: target.email, reason: parsed.data.reason },
    });

    try {
      await sendTeacherRejectedEmail(target.email, target.name, parsed.data.reason);
    } catch (err) {
      log.error("teacher rejected email failed", { userId: id }, err);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
