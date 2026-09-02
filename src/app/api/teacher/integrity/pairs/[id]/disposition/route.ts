import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { log } from "@/lib/log";
import { assertIntegrityScopeStaff } from "@/lib/integrity/access";
import { toResponse, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["DISMISSED", "CONFIRMED", "ESCALATED"]),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getSession();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid data");

    const pair = await prisma.similarityPair.findUnique({ where: { id } });
    if (!pair) throw new NotFoundError("Similarity pair not found");

    await assertIntegrityScopeStaff(session, pair.scopeType, pair.scopeId);

    const updated = await prisma.similarityPair.update({
      where: { id },
      data: {
        status: parsed.data.status,
        reviewedById: session!.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.note ?? "",
      },
    });

    log.info("integrity pair disposition set", {
      pairId: id,
      status: parsed.data.status,
      reviewedById: session!.id,
      scopeType: pair.scopeType,
      scopeId: pair.scopeId,
    });

    return NextResponse.json({ ok: true, pair: updated });
  } catch (err) {
    return toResponse(err);
  }
}
