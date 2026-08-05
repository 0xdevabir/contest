import { NextRequest, NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { compileAndJudge, runCustom } from "@/lib/judge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  problemId: string;
  code: string;
  mode?: "submit" | "run";
  stdin?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const problem = getProblem(body.problemId);
  if (!problem) {
    return NextResponse.json({ ok: false, message: "Problem not found" }, { status: 404 });
  }

  if (!body.code || typeof body.code !== "string") {
    return NextResponse.json({ ok: false, message: "Code required" }, { status: 400 });
  }

  const mode = body.mode ?? "submit";

  if (mode === "run") {
    const result = await runCustom({
      code: body.code,
      stdin: body.stdin ?? problem.sampleInput ?? "",
      timeLimitMs: problem.timeLimitMs,
    });
    return NextResponse.json({ ok: true, ...result, results: [] });
  }

  if (problem.openEnded || !problem.tests.length) {
    return NextResponse.json({
      ok: true,
      verdict: "SKIP",
      results: [],
      message:
        "This problem is open-ended and has no auto-judge tests. Use Run with custom input instead.",
    });
  }

  const result = await compileAndJudge({
    code: body.code,
    tests: problem.tests,
    timeLimitMs: problem.timeLimitMs,
  });

  return NextResponse.json({ ok: true, ...result });
}
