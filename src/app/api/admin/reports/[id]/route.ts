import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { recordAdminAction } from "@/lib/admin-audit";
import { toResponse, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["ACTIONED", "DISMISSED"]),
  hideTarget: z.boolean().default(false),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    assertCan(session, "comment:moderate");

    const report = await prisma.contentReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError("Report not found");

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid request", parsed.error.flatten());

    if (parsed.data.hideTarget && report.target === "comment") {
      await prisma.comment.update({
        where: { id: report.targetId },
        data: { hiddenAt: new Date(), hiddenById: session!.id, hiddenReason: report.reason },
      }).catch(() => undefined);
    }

    const updated = await prisma.contentReport.update({
      where: { id },
      data: { status: parsed.data.status, handledById: session!.id, handledAt: new Date() },
    });

    await recordAdminAction({
      actorId: session!.id,
      action: "content_report.resolve",
      targetType: "SYSTEM",
      targetId: id,
      details: { status: parsed.data.status, target: report.target, targetId: report.targetId, hideTarget: parsed.data.hideTarget },
    });

    return NextResponse.json({ ok: true, report: updated });
  } catch (err) {
    return toResponse(err);
  }
}
