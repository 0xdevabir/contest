import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertAnalyticsEnabled } from "@/lib/analytics-flag";
import { assertCan } from "@/lib/authz";
import { getProblemAnalytics } from "@/lib/analytics/problem";
import { toResponse, AuthError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** D4 — setter analytics: difficulty, discrimination, verdict mix. Author or admin only. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getSession();
    await assertAnalyticsEnabled(session);
    const { id } = await params;
    if (!session) throw new AuthError();

    const problem = await prisma.problem.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!problem) throw new NotFoundError("Problem not found");
    // problem:viewHiddenTests already encodes "author or admin" ownership —
    // reused rather than adding a bespoke analytics action for the same shape.
    assertCan(session, "problem:viewHiddenTests", { ownerId: problem.authorId });

    const analytics = await getProblemAnalytics(id);
    if (!analytics) throw new NotFoundError("Problem not found");
    return NextResponse.json({ ok: true, analytics });
  } catch (err) {
    return toResponse(err);
  }
}
