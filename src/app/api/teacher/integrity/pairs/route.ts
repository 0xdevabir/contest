import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertIntegrityScopeStaff } from "@/lib/integrity/access";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const scopeType = searchParams.get("scopeType") ?? "";
    const scopeId = searchParams.get("scopeId") ?? "";
    if (!scopeType || !scopeId) throw new ValidationError("scopeType and scopeId are required");

    await assertIntegrityScopeStaff(session, scopeType, scopeId);

    const pairs = await prisma.similarityPair.findMany({
      where: { scopeType, scopeId },
      orderBy: { zScore: "desc" },
      include: {
        submissionA: { select: { user: { select: { id: true, name: true, email: true } } } },
        submissionB: { select: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    return NextResponse.json({ ok: true, pairs });
  } catch (err) {
    return toResponse(err);
  }
}
