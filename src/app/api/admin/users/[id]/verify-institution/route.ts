import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { verifyMembership } from "@/lib/institutions";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, NotFoundError, ConflictError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "user:manage");
    const { id } = await params;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundError("User not found");
    if (!target.institutionId) throw new ConflictError("This user has not selected an institution");

    await verifyMembership(id, { kind: "manual", approverId: session!.id });

    await recordAdminAction({
      actorId: session!.id,
      action: "INSTITUTION_MANUALLY_VERIFIED",
      targetType: "USER",
      targetId: id,
      details: { institutionId: target.institutionId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
