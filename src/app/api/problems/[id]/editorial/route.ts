import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getProblemRef } from "@/lib/problems";
import { canViewEditorial } from "@/lib/community";
import { renderStatement } from "@/lib/statement";
import { toResponse, ForbiddenError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Public read path — gated per D1's spoiler matrix. 403 with the gate's
 * reason string rather than a bare "forbidden" (API contract table). */
export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const explicitReveal = new URL(req.url).searchParams.get("reveal") === "1";

    let session = null;
    try {
      session = await getSession();
    } catch {
      session = null;
    }

    const gate = await canViewEditorial(session, id, explicitReveal);
    if (!gate.visible) throw new ForbiddenError(gate.reason);

    const ref = await getProblemRef(id);
    if (!ref) throw new NotFoundError("Problem not found");

    const editorial = await prisma.editorial.findFirst({
      where: { problemId: ref.problemId, published: true },
      select: {
        id: true,
        contentMd: true,
        solutions: true,
        updatedAt: true,
        author: { select: { name: true } },
      },
    });
    if (!editorial) throw new NotFoundError("No editorial has been published for this problem yet");

    // Unlike a ProblemVersion, a published Editorial can be edited in place —
    // cache by id+updatedAt so an edit invalidates the cached render.
    const contentHtml = await renderStatement(editorial.contentMd, `${editorial.id}:${editorial.updatedAt.getTime()}`);

    return NextResponse.json({ ok: true, editorial: { ...editorial, contentHtml } });
  } catch (err) {
    return toResponse(err);
  }
}
