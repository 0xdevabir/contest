import { NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { getProblemSolvers } from "@/lib/solvers";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

// Intentionally public — the solvers list carries no access control, so
// there is no permission for assertCan to check here.
export async function GET(_req: Request, { params }: Props) {
  try {
    const { id } = await params;
    if (!getProblem(id)) throw new NotFoundError("Problem not found");

    const data = await getProblemSolvers(id);
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return toResponse(err);
  }
}
