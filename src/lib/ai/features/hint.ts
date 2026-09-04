import { prisma } from "../../db";
import { ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "../../errors";
import { isProblemInLiveContest } from "../../live-contest-problems";
import { getSubmissionPayload } from "../../submission-payload";
import { MODEL, streamText, summarizeUsage } from "../client";
import { checkBudget, recordUsage } from "../budget";
import { reviewHintResponse, type HintLevel } from "../guardrails";
import { buildHintPrompt, HintOutputSchema } from "../prompts/hint";
import type { AiJobKind } from "@prisma/client";

/**
 * D5 (docs/phases/PHASE-15-intelligence.md) — enforcement layer 4: hard
 * disabled during a live contest or an open graded assignment. Checked
 * against the same Redis live-contest set Phase 11 uses for editorial
 * gating (src/lib/live-contest-problems.ts / src/lib/community.ts), plus a
 * direct check on any open Assignment currently including this problem for
 * this student.
 *
 * The response is streamed from Anthropic (lower time-to-first-byte
 * internally, per D1's streaming guidance) but never forwarded token by
 * token to the student: layer 3's post-filter (guardrails.ts) needs the
 * *complete* response — a partial stream could leak a fenced code block
 * before the filter ever sees the closing fence. The API route exposes
 * this as a single flush once `finalize()` resolves, not a live stream.
 */
const MAX_HINTS_PER_PROBLEM = 3;
const KIND: AiJobKind = "HINT";

async function assertHintsAllowed(userId: string, problemId: string): Promise<void> {
  if (await isProblemInLiveContest(problemId)) {
    throw new ForbiddenError("Hints are disabled while this problem is part of a live contest.");
  }

  const now = new Date();
  const openAssignment = await prisma.assignmentProblem.findFirst({
    where: {
      problemId,
      assignment: {
        published: true,
        OR: [{ opensAt: null }, { opensAt: { lte: now } }],
        AND: [{ OR: [{ closesAt: null }, { closesAt: { gte: now } }] }],
        section: { enrollments: { some: { userId, status: "ACTIVE" } } },
      },
    },
  });
  if (openAssignment) {
    throw new ForbiddenError("Hints are disabled while this problem is part of an open graded assignment.");
  }

  const count = await prisma.hintRequest.count({ where: { userId, problemId } });
  if (count >= MAX_HINTS_PER_PROBLEM) {
    throw new RateLimitError(24 * 60 * 60, `You've used all ${MAX_HINTS_PER_PROBLEM} hints for this problem.`);
  }
}

export async function requestHint(opts: {
  userId: string;
  institutionId: string | null;
  problemId: string;
  submissionId: string;
  level: HintLevel;
}): Promise<{ hintId: string; text: string }> {
  await assertHintsAllowed(opts.userId, opts.problemId);

  const submission = await prisma.submission.findUnique({
    where: { id: opts.submissionId },
    include: { problemRef: { include: { currentVersion: { include: { references: true } } } } },
  });
  if (!submission || submission.userId !== opts.userId) throw new NotFoundError("Submission not found");
  if (submission.problemRefId !== opts.problemId) throw new ValidationError("Submission does not belong to this problem");
  if (submission.verdict === "AC") throw new ValidationError("No hint needed — this submission already passed.");

  const version = submission.problemRef?.currentVersion;
  if (!version) throw new NotFoundError("Problem has no published version");
  const reference = version.references.find((r) => r.expectedVerdict === "AC");

  const payload = await getSubmissionPayload(submission);
  const report = payload.report as { tests?: { verdict: string; input?: string }[] } | null;
  const failingTest = report?.tests?.find((t) => t.verdict !== "AC");

  const promptInput = {
    requestedLevel: opts.level,
    statementMd: version.statementMd,
    studentCode: payload.code,
    studentLanguage: submission.language,
    failingInput: failingTest?.input ?? "(not available — judge against the sample tests)",
    verdict: submission.verdict,
  };

  await checkBudget(opts.institutionId);
  const job = await prisma.aiJob.create({
    data: {
      kind: KIND,
      status: "RUNNING",
      requestedById: opts.userId,
      institutionId: opts.institutionId,
      inputHash: opts.submissionId, // one hint call per submission+level, no cross-student cache
      input: { ...promptInput, submissionId: opts.submissionId },
      model: MODEL,
    },
  });

  let declared: { level: number; text: string };
  try {
    const prompt = buildHintPrompt(promptInput);
    const stream = streamText({ ...prompt, effort: "medium", schema: HintOutputSchema });
    const finalMessage = await stream.finalMessage();
    if (!finalMessage.parsed_output) throw new Error("Hint model returned no parsed output");
    declared = finalMessage.parsed_output;

    const usage = summarizeUsage(finalMessage.usage);
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        output: declared,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        costCents: usage.costCents,
        finishedAt: new Date(),
      },
    });
    await recordUsage(opts.institutionId, usage.costCents);
  } catch (err) {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
    throw err;
  }

  const review = reviewHintResponse({
    requestedLevel: opts.level,
    declaredLevel: declared.level,
    text: declared.text,
    referenceSource: reference?.source ?? "",
  });

  const hint = await prisma.hintRequest.create({
    data: {
      userId: opts.userId,
      problemId: opts.problemId,
      submissionId: opts.submissionId,
      level: opts.level,
      hint: review.ok ? declared.text : `[REJECTED: ${review.ok ? "" : review.reason}]`,
    },
  });
  await prisma.aiJob.update({ where: { id: job.id }, data: { reviewedAt: new Date(), accepted: review.ok } });

  if (!review.ok) {
    throw new ForbiddenError(`Hint withheld by the safety filter: ${review.reason}`);
  }
  return { hintId: hint.id, text: declared.text };
}

export async function rateHint(hintId: string, userId: string, helpful: boolean): Promise<void> {
  const hint = await prisma.hintRequest.findUnique({ where: { id: hintId } });
  if (!hint || hint.userId !== userId) throw new NotFoundError("Hint not found");
  await prisma.hintRequest.update({ where: { id: hintId }, data: { helpful } });
}
