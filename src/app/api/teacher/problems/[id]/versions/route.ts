import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { toResponse } from "@/lib/errors";
import { requireOwnedProblem, forkVersion } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Forks the problem's current version into a fresh mutable draft (v+1). */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireOwnedProblem(id, session!);

    const version = await forkVersion(id, session!.id);
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    return toResponse(err);
  }
}
