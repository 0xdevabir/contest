import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, NotFoundError } from "@/lib/errors";
import { requireOwnedVersion, assertVersionEditable } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string; tid: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id, vid, tid } = await params;
    const session = await getSession();
    await requireOwnedVersion(id, vid, session!);
    await assertVersionEditable(vid);

    const testCase = await prisma.testCase.findUnique({ where: { id: tid }, include: { group: true } });
    if (!testCase || testCase.group.problemVersionId !== vid) throw new NotFoundError("Test case not found");

    await prisma.testCase.delete({ where: { id: tid } });
    // Blob content is content-addressed and may be shared by other cases
    // (identical input across problems) — it is intentionally never deleted
    // here; an orphaned blob costs storage, not correctness.
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
