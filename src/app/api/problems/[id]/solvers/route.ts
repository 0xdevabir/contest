import { NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { getProblemSolvers } from "@/lib/solvers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  if (!getProblem(id)) {
    return NextResponse.json({ ok: false, message: "Problem not found" }, { status: 404 });
  }

  try {
    const data = await getProblemSolvers(id);
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    console.error("solvers fetch failed", err);
    return NextResponse.json({ ok: false, message: "Could not load solvers" }, { status: 500 });
  }
}
