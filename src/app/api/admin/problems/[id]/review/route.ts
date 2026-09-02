import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError } from "@/lib/errors";
import { reviewProblem } from "@/lib/problem-authoring";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    assertCan(session, "problem:review");

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid review decision", parsed.error.flatten());

    const problem = await reviewProblem(id, parsed.data.decision);

    await recordAdminAction({
      actorId: session!.id,
      action: parsed.data.decision === "approve" ? "PROBLEM_REVIEW_APPROVED" : "PROBLEM_REVIEW_REJECTED",
      targetType: "PROBLEM",
      targetId: id,
      details: { note: parsed.data.note ?? "" },
    });

    return NextResponse.json({ ok: true, problem });
  } catch (err) {
    return toResponse(err);
  }
}
