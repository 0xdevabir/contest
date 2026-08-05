import { NextRequest, NextResponse } from "next/server";
import type { Verdict } from "@prisma/client";
import { getProblem } from "@/lib/problems";
import { compileAndJudge, runCustom } from "@/lib/judge";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { effectiveContestStatus, isContestOpen } from "@/lib/contests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  problemId: string;
  code: string;
  mode?: "submit" | "run";
  stdin?: string;
  contestId?: string;
};

async function persistSubmission(opts: {
  userId: string | null;
  problemId: string;
  contestId?: string;
  code: string;
  verdict: Verdict;
  timeMs?: number;
  stdout?: string;
  stderr?: string;
}) {
  if (!opts.userId) return;
  try {
    await prisma.submission.create({
      data: {
        userId: opts.userId,
        problemId: opts.problemId,
        contestId: opts.contestId || null,
        code: opts.code,
        language: "c",
        verdict: opts.verdict,
        timeMs: opts.timeMs ?? null,
        stdout: opts.stdout?.slice(0, 8000) ?? null,
        stderr: opts.stderr?.slice(0, 8000) ?? null,
      },
    });

    if (opts.verdict === "AC" && !opts.contestId) {
      await prisma.solvedProblem.upsert({
        where: {
          userId_problemId: { userId: opts.userId, problemId: opts.problemId },
        },
        update: { solveCount: { increment: 1 } },
        create: { userId: opts.userId, problemId: opts.problemId },
      });
    }
  } catch (err) {
    console.error("persist submission failed", err);
  }
}

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

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  const mode = body.mode ?? "submit";

  // Run stays anonymous so people can try input before signing up. Submit is the
  // graded action — that always needs an account so progress and scoreboards stay honest.
  if (mode === "run") {
    const result = await runCustom({
      code: body.code,
      stdin: body.stdin ?? problem.sampleInput ?? "",
      timeLimitMs: problem.timeLimitMs,
    });
    return NextResponse.json({ ok: true, ...result, results: [] });
  }

  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Sign in to submit an answer." },
      { status: 401 }
    );
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

  // Contest gate — must be LIVE, problem must belong to contest, user must be registered
  if (body.contestId) {

    const contest = await prisma.contest.findUnique({
      where: { id: body.contestId },
      include: { problems: { select: { problemId: true } } },
    });

    if (!contest || !isContestOpen(contest.status, contest.startsAt, contest.endsAt)) {
      const ended =
        contest && effectiveContestStatus(contest.status, contest.endsAt) === "ENDED";
      return NextResponse.json(
        {
          ok: false,
          message: ended
            ? "This contest has ended — open the problem outside the contest to keep practising."
            : "Contest is not live",
        },
        { status: 400 }
      );
    }

    // Verify the submitted problem is actually part of this contest
    const inContest = contest.problems.some((p) => p.problemId === body.problemId);
    if (!inContest) {
      return NextResponse.json(
        { ok: false, message: "This problem is not part of the contest" },
        { status: 403 }
      );
    }

    const reg = await prisma.contestRegistration.findUnique({
      where: { contestId_userId: { contestId: body.contestId, userId: session.id } },
    });
    if (!reg) {
      return NextResponse.json({ ok: false, message: "Register for the contest first" }, { status: 403 });
    }

    // Enforce maxSubmissionsPerProblem if configured
    const rules = contest.rules as Record<string, unknown> | null;
    const maxSubs = typeof rules?.maxSubmissionsPerProblem === "number"
      ? rules.maxSubmissionsPerProblem
      : 0;
    if (maxSubs > 0) {
      const subCount = await prisma.submission.count({
        where: {
          userId: session.id,
          problemId: body.problemId,
          contestId: body.contestId,
        },
      });
      if (subCount >= maxSubs) {
        return NextResponse.json(
          { ok: false, message: `Submission limit (${maxSubs}) reached for this problem` },
          { status: 429 }
        );
      }
    }
  }

  const result = await compileAndJudge({
    code: body.code,
    tests: problem.tests,
    timeLimitMs: problem.timeLimitMs,
  });

  const first = result.results[0];
  await persistSubmission({
    userId: session?.id ?? null,
    problemId: body.problemId,
    contestId: body.contestId,
    code: body.code,
    verdict: result.verdict as Verdict,
    timeMs: first?.timeMs,
    stdout: first?.stdout,
    stderr: result.compileStderr || first?.stderr,
  });

  return NextResponse.json({
    ok: true,
    ...result,
    saved: Boolean(session),
  });
}




