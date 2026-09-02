import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertIntegrityScopeStaff } from "@/lib/integrity/access";
import { normalizeSource } from "@/lib/integrity/normalize";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Pair detail for the console's diff view — normalized token streams for
 * both submissions, aligned with the persisted `regions` (which are indices
 * into exactly this token array, per `winnow.ts`/`compare.ts`). Raw source
 * for the toggle is fetched separately from `/api/submissions/[id]`, which
 * already gates on staff/owner.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    const { id } = await params;

    const pair = await prisma.similarityPair.findUnique({
      where: { id },
      include: {
        submissionA: { select: { language: true, code: true, user: { select: { id: true, name: true, email: true } } } },
        submissionB: { select: { language: true, code: true, user: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!pair) throw new NotFoundError("Similarity pair not found");

    await assertIntegrityScopeStaff(session, pair.scopeType, pair.scopeId);

    const aTokens = normalizeSource(pair.submissionA.code, pair.submissionA.language);
    const bTokens = normalizeSource(pair.submissionB.code, pair.submissionB.language);

    return NextResponse.json({ ok: true, pair, aTokens, bTokens });
  } catch (err) {
    return toResponse(err);
  }
}
