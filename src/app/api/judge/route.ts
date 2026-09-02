import { NextRequest, NextResponse } from "next/server";
import type { Verdict } from "@prisma/client";
import type { TestResult } from "@/lib/types";
import { getProblem, getProblemRef } from "@/lib/problems";
import { compileAndJudge, runCustom, MAX_OUTPUT_BYTES } from "@/lib/judge";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { effectiveContestStatus, isContestOpen } from "@/lib/contests";
import { contestSubmissionError } from "@/lib/contest-access";
import {
  toResponse,
  ValidationError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  RateLimitError,
  ServiceUnavailableError,
} from "@/lib/errors";
import { consume, retryAfterSeconds, tryAcquireAnonRunSlot, releaseAnonRunSlot } from "@/lib/ratelimit";
import { clientIp } from "@/lib/request-context";
import { log } from "@/lib/log";
import { applyJudgedSideEffects } from "@/lib/submission-effects";
import { isEnabled } from "@/lib/flags";
import { redisAvailable } from "@/lib/redis";
import { enqueueJudgeJob } from "@/lib/queue/queue";
import { priorityFor } from "@/lib/queue/priority";

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
  report?: unknown;
}) {
  if (!opts.userId) return;
  try {
    // Populated when the problem is DB-backed (problemDb flag on) so a fresh
    // submission never needs the migration's link-refs backfill script to
    // catch up — only pre-migration history does.
    const ref = await getProblemRef(opts.problemId).catch(() => null);

    const created = await prisma.submission.create({
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
        report: opts.report != null ? JSON.parse(JSON.stringify(opts.report)) : undefined,
        problemRefId: ref?.problemId ?? null,
        problemVersionId: ref?.versionId ?? null,
      },
    });

    await applyJudgedSideEffects({
      userId: opts.userId,
      problemId: opts.problemId,
      contestId: opts.contestId,
      verdict: opts.verdict,
      problemRefId: ref?.problemId,
      submissionId: created.id,
      code: opts.code,
      language: "c",
    });
  } catch (err) {
    log.error("persist submission failed", { problemId: opts.problemId }, err);
  }
}

/**
 * Creates the QUEUED Submission row and enqueues it (D1/D2). Returns the
 * 202 response on success, or `null` when Redis is unavailable — the caller
 * decides whether that means "fall back to sync" (never, here — see D1's
 * chaos case) or a clear 503.
 */
async function enqueueQueuedSubmission(opts: {
  userId: string;
  problemId: string;
  contestId?: string;
  code: string;
  contestLive: boolean;
}): Promise<NextResponse | null> {
  const ref = await getProblemRef(opts.problemId).catch(() => null);
  const priority = priorityFor({ contestLive: opts.contestLive, authenticated: true });

  const submission = await prisma.submission.create({
    data: {
      userId: opts.userId,
      problemId: opts.problemId,
      contestId: opts.contestId || null,
      code: opts.code,
      language: "c",
      verdict: "PENDING",
      state: "QUEUED",
      priority,
      queuedAt: new Date(),
      problemRefId: ref?.problemId ?? null,
      problemVersionId: ref?.versionId ?? null,
    },
  });

  const enqueued = await enqueueJudgeJob({ submissionId: submission.id, priority });
  if (!enqueued) {
    // Roll back the row rather than leaving an orphaned QUEUED submission
    // that no worker will ever pick up.
    await prisma.submission.delete({ where: { id: submission.id } }).catch(() => undefined);
    return null;
  }

  return NextResponse.json({ ok: true, submissionId: submission.id, state: "QUEUED" }, { status: 202 });
}

/**
 * Hidden-test I/O must never reach the browser — otherwise a submitter can
 * binary-search the entire hidden test suite one WA/AC bit at a time. Sample
 * tests keep their full output for debugging; anything not marked `sample`
 * is reduced to just its verdict and timing.
 */
function sanitizeResultsForClient(results: TestResult[]): TestResult[] {
  return results.map((r) =>
    r.sample
      ? r
      : { index: r.index, verdict: r.verdict, timeMs: r.timeMs, stdout: "", stderr: "", sample: r.sample }
  );
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    return toResponse(err);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    throw new ValidationError("Invalid JSON");
  }

  const problem = await getProblem(body.problemId);
  if (!problem) {
    throw new NotFoundError("Problem not found");
  }

  if (!body.code || typeof body.code !== "string") {
    throw new ValidationError("Code required");
  }

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  const mode = body.mode ?? "submit";
  const ip = clientIp(req);

  // Run stays anonymous so people can try input before signing up. Submit is the
  // graded action — that always needs an account so progress and scoreboards stay honest.
  if (mode === "run") {
    const bucket = session
      ? { bucket: "run:user", identity: session.id }
      : { bucket: "run:anon", identity: ip };
    const limit = session ? { tokens: 60, windowSec: 300 } : { tokens: 10, windowSec: 300 };
    const rl = await consume(bucket, limit);
    if (!rl.ok) {
      throw new RateLimitError(retryAfterSeconds(rl.resetAt), "Too many runs. Try again shortly.");
    }

    // Anonymous execution additionally competes for a small global concurrency
    // budget — a saturated queue returns 429 immediately (a clear "try again")
    // rather than making a guest wait behind other guests' compiles.
    let anonSlot = false;
    if (!session) {
      anonSlot = tryAcquireAnonRunSlot();
      if (!anonSlot) {
        throw new RateLimitError(2, "Judge is busy. Try again in a moment.");
      }
    }

    try {
      const result = await runCustom({
        code: body.code,
        stdin: body.stdin ?? problem.sampleInput ?? "",
        timeLimitMs: session ? problem.timeLimitMs : Math.min(problem.timeLimitMs, 2000),
        maxOutputBytes: session ? undefined : Math.floor(MAX_OUTPUT_BYTES / 2),
      });
      return NextResponse.json({ ok: true, ...result, results: [] });
    } finally {
      if (anonSlot) releaseAnonRunSlot();
    }
  }

  if (!session) {
    throw new AuthError("Sign in to submit an answer.");
  }

  // Rate limit submissions: per-user, and per-(user, problem) to blunt
  // verdict-oracle probing against hidden tests.
  const submitUser = await consume(
    { bucket: "submit:user", identity: session.id },
    { tokens: 30, windowSec: 300 }
  );
  if (!submitUser.ok) {
    throw new RateLimitError(retryAfterSeconds(submitUser.resetAt), "Too many submissions. Try again shortly.");
  }
  const submitProblem = await consume(
    { bucket: "submit:problem", identity: `${session.id}:${body.problemId}` },
    { tokens: 10, windowSec: 60 }
  );
  if (!submitProblem.ok) {
    throw new RateLimitError(
      retryAfterSeconds(submitProblem.resetAt),
      "Too many submissions for this problem. Slow down."
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

    const contestOpen = Boolean(
      contest && isContestOpen(contest.status, contest.startsAt, contest.endsAt)
    );
    if (!contest || !contestOpen) {
      const message = contestSubmissionError({
        contestOpen,
        contestEnded:
          contest !== null &&
          effectiveContestStatus(contest.status, contest.endsAt) === "ENDED",
        problemIncluded: false,
        registered: false,
      });
      throw new ValidationError(message ?? "This contest is not open.");
    }

    // Verify the submitted problem is actually part of this contest
    const inContest = contest.problems.some((p) => p.problemId === body.problemId);
    if (!inContest) {
      throw new ForbiddenError(
        contestSubmissionError({
          contestOpen: true,
          contestEnded: false,
          problemIncluded: false,
          registered: false,
        }) ?? "This problem is not part of the contest"
      );
    }

    const reg = await prisma.contestRegistration.findUnique({
      where: { contestId_userId: { contestId: body.contestId, userId: session.id } },
    });
    if (!reg) {
      throw new ForbiddenError(
        contestSubmissionError({
          contestOpen: true,
          contestEnded: false,
          problemIncluded: true,
          registered: false,
        }) ?? "Register for the contest first"
      );
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
        throw new RateLimitError(60, `Submission limit (${maxSubs}) reached for this problem`);
      }
    }
  }

  // Reaching here with a contestId means the gate above already confirmed
  // the contest is open — a live contest submission gets top queue priority.
  const contestLive = Boolean(body.contestId);

  if (await isEnabled("judgeQueue", { userId: session.id, role: session.role })) {
    const enqueued = await enqueueQueuedSubmission({
      userId: session.id,
      problemId: body.problemId,
      contestId: body.contestId,
      code: body.code,
      contestLive,
    });
    if (enqueued) return enqueued;
    if (!(await redisAvailable())) {
      // The flag is on but Redis is unreachable — fail loudly rather than
      // silently falling back to synchronous judging, which would look like
      // a working queue and hide the outage (D1's documented chaos case).
      throw new ServiceUnavailableError("Judge queue is temporarily unavailable. Try again shortly.");
    }
  }

  const result = await compileAndJudge({
    code: body.code,
    tests: problem.tests,
    timeLimitMs: problem.timeLimitMs,
  });

  // F-4: persist the slowest test's time (not just the first — an AC over 20
  // tests otherwise records test 1's time, which is wrong for TLE-margin and
  // "fastest solution" analytics), and only reveal stdout from a *sample*
  // test — hidden-test output must never feed the student-facing history page.
  const failing = result.results.find((r) => r.verdict !== "AC");
  const shown = failing ?? result.results[result.results.length - 1];
  const maxTime = result.results.reduce((m, r) => Math.max(m, r.timeMs), 0);

  await persistSubmission({
    userId: session.id,
    problemId: body.problemId,
    contestId: body.contestId,
    code: body.code,
    verdict: result.verdict as Verdict,
    timeMs: result.results.length ? maxTime : undefined,
    stdout: shown?.sample ? shown.stdout : undefined,
    stderr: result.compileStderr || shown?.stderr,
    report: result,
  });

  return NextResponse.json({
    ok: true,
    ...result,
    results: sanitizeResultsForClient(result.results),
    saved: true,
  });
}
