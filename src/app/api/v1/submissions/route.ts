import { z } from "zod";
import type { Verdict } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error, encodeCursor, parsePageParams } from "@/lib/v1/http";
import { ValidationError, NotFoundError, ForbiddenError, RateLimitError, ServiceUnavailableError } from "@/lib/errors";
import { getProblem, getProblemRef } from "@/lib/problems";
import { compileAndJudge } from "@/lib/judge";
import { isContestOpen, effectiveContestStatus } from "@/lib/contests";
import { contestSubmissionError } from "@/lib/contest-access";
import { consume, retryAfterSeconds } from "@/lib/ratelimit";
import { isEnabled } from "@/lib/flags";
import { redisAvailable } from "@/lib/redis";
import { enqueueJudgeJob } from "@/lib/queue/queue";
import { priorityFor } from "@/lib/queue/priority";
import { applyJudgedSideEffects } from "@/lib/submission-effects";

export const runtime = "nodejs";

const bodySchema = z.object({
  problem_id: z.string().min(1),
  code: z.string().min(1),
  contest_id: z.string().optional(),
});

/** POST /api/v1/submissions — submits as the key owner. A trimmed version of
 * /api/judge's submit path: same contest gate and queue/sync fallback, no
 * anonymous run mode, no variant generation (contest/assignment per-student
 * variants stay a web-app-only feature for now). */
export async function POST(req: Request) {
  try {
    const key = await requireApiKey(req, "submissions:write");

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());
    const body = parsed.data;

    const problem = await getProblem(body.problem_id);
    if (!problem) throw new NotFoundError("Problem not found");

    const submitUser = await consume({ bucket: "submit:user", identity: key.owner.id }, { tokens: 30, windowSec: 300 });
    if (!submitUser.ok) throw new RateLimitError(retryAfterSeconds(submitUser.resetAt), "Too many submissions. Try again shortly.");

    let contestLive = false;
    if (body.contest_id) {
      const contest = await prisma.contest.findUnique({
        where: { id: body.contest_id },
        include: { problems: { select: { problemId: true } } },
      });
      const contestOpen = Boolean(contest && isContestOpen(contest.status, contest.startsAt, contest.endsAt));
      if (!contest || !contestOpen) {
        const message = contestSubmissionError({
          contestOpen,
          contestEnded: contest !== null && effectiveContestStatus(contest.status, contest.endsAt) === "ENDED",
          problemIncluded: false,
          registered: false,
        });
        throw new ValidationError(message ?? "This contest is not open.");
      }
      if (!contest.problems.some((p) => p.problemId === body.problem_id)) {
        throw new ForbiddenError("This problem is not part of the contest");
      }
      const reg = await prisma.contestRegistration.findUnique({
        where: { contestId_userId: { contestId: body.contest_id, userId: key.owner.id } },
      });
      if (!reg) throw new ForbiddenError("Register for the contest first");
      contestLive = true;
    }

    if (problem.openEnded || !problem.tests.length) {
      return v1Data({ verdict: "SKIP", message: "This problem is open-ended and has no auto-judge tests." });
    }

    if (await isEnabled("judgeQueue", { userId: key.owner.id, role: key.owner.role })) {
      const ref = await getProblemRef(body.problem_id).catch(() => null);
      const priority = priorityFor({ contestLive, authenticated: true });
      const submission = await prisma.submission.create({
        data: {
          userId: key.owner.id,
          problemId: body.problem_id,
          contestId: body.contest_id || null,
          code: body.code,
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
      if (enqueued) return v1Data({ id: submission.id, state: "QUEUED" }, undefined, 202);
      await prisma.submission.delete({ where: { id: submission.id } }).catch(() => undefined);
      if (!(await redisAvailable())) {
        throw new ServiceUnavailableError("Judge queue is temporarily unavailable. Try again shortly.");
      }
    }

    const result = await compileAndJudge({ code: body.code, tests: problem.tests, timeLimitMs: problem.timeLimitMs });
    const maxTime = result.results.reduce((m, r) => Math.max(m, r.timeMs), 0);
    const ref = await getProblemRef(body.problem_id).catch(() => null);

    const created = await prisma.submission.create({
      data: {
        userId: key.owner.id,
        problemId: body.problem_id,
        contestId: body.contest_id || null,
        code: body.code,
        language: "c",
        verdict: result.verdict as Verdict,
        timeMs: result.results.length ? maxTime : null,
        report: JSON.parse(JSON.stringify(result)),
        problemRefId: ref?.problemId ?? null,
        problemVersionId: ref?.versionId ?? null,
      },
    });
    await applyJudgedSideEffects({
      userId: key.owner.id,
      problemId: body.problem_id,
      contestId: body.contest_id,
      verdict: result.verdict as Verdict,
      problemRefId: ref?.problemId,
      submissionId: created.id,
      code: body.code,
      language: "c",
    });

    return v1Data({ id: created.id, state: "DONE", verdict: result.verdict, time_ms: created.timeMs }, undefined, 201);
  } catch (err) {
    return v1Error(err);
  }
}

/** GET /api/v1/submissions — the key owner's own submission history. */
export async function GET(req: Request) {
  try {
    const key = await requireApiKey(req, "submissions:read");
    const url = new URL(req.url);
    const { limit, cursor } = parsePageParams(url);

    const rows = await prisma.submission.findMany({
      where: { userId: key.owner.id },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
      orderBy: { id: "asc" },
      select: { id: true, problemId: true, contestId: true, verdict: true, language: true, score: true, createdAt: true },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return v1Data(
      page.map((s) => ({
        id: s.id,
        problem_id: s.problemId,
        contest_id: s.contestId,
        verdict: s.verdict,
        language: s.language,
        score: s.score,
        created_at: s.createdAt.toISOString(),
      })),
      { nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null, hasMore }
    );
  } catch (err) {
    return v1Error(err);
  }
}
