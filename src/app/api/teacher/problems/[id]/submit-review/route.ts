import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toResponse } from "@/lib/errors";
import { assertCan } from "@/lib/authz";
import { requireOwnedProblem, submitForReview } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const problem = await requireOwnedProblem(id, session!);
    assertCan(session, "problem:submitReview", { ownerId: problem.authorId });

    const updated = await submitForReview(id);
    return NextResponse.json({ ok: true, problem: updated });
  } catch (err) {
    return toResponse(err);
  }
}
