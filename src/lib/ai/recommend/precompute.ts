import type { AiJobKind } from "@prisma/client";
import { prisma } from "../../db";
import { getRedis } from "../../redis";
import { log } from "../../log";
import { anthropic, MODEL, summarizeUsage } from "../client";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildRecommendExplainPrompt, RecommendExplainOutputSchema } from "../prompts/recommend";
import { rankCandidates, type AttemptState, type CandidateProblem, type StudentContext } from "./score";

/**
 * D4/D2 — "precomputed nightly... not on page load", via the Batch API
 * ("bulk editorial drafting across 200 problems, nightly recommendation
 * precomputation... 50% cost"). Two-phase because a batch can take up to
 * 24h to complete: each worker tick either (a) submits a fresh batch of
 * one-line rationale requests for the just-scored top-20-per-student set,
 * or (b) polls the previously submitted batch and, once it's ended,
 * applies results by `custom_id`. Never both in the same tick.
 */

const TOP_N = 20;
const PENDING_BATCH_KEY = "ai:recommend:pending-batch";
const RECOMMEND_KIND: AiJobKind = "RECOMMEND";
const CUSTOM_ID_SEP = "__";

type CandidateProblemWithTitle = CandidateProblem & { title: string };

async function loadCandidateProblems(): Promise<CandidateProblemWithTitle[]> {
  const problems = await prisma.problem.findMany({
    where: { status: "PUBLISHED", visibility: { in: ["PUBLIC", "INSTITUTION"] } },
    select: { id: true, title: true, rating: { select: { rating: true } }, tags: { select: { tagId: true, weight: true } } },
  });
  return problems.map((p) => ({ id: p.id, title: p.title, elo: p.rating?.rating ?? 1500, tags: p.tags }));
}

async function loadStudentContext(
  userId: string,
  institutionId: string | null
): Promise<StudentContext & { recentSolvedTitles: string[] }> {
  const [rating, tagStats, sections, recentSolved] = await Promise.all([
    prisma.userRating.findUnique({ where: { userId } }),
    prisma.userTagStat.findMany({ where: { userId }, select: { tagId: true, mastery: true } }),
    prisma.enrollment.findMany({
      where: { userId, status: "ACTIVE" },
      select: { section: { select: { assignments: { select: { problems: { select: { problem: { select: { tags: { select: { tagId: true } } } } } } } } } } },
    }),
    prisma.solvedProblem.findMany({
      where: { userId, problemRefId: { not: null } },
      orderBy: { firstSolvedAt: "desc" },
      take: 5,
      select: { problemRef: { select: { title: true, tags: { select: { tagId: true } } } } },
    }),
  ]);

  const curriculumTagIds = new Set<string>();
  for (const enr of sections) {
    for (const a of enr.section.assignments) {
      for (const ap of a.problems) {
        for (const t of ap.problem.tags) curriculumTagIds.add(t.tagId);
      }
    }
  }

  const recentTagIds = recentSolved.flatMap((s) => s.problemRef?.tags.map((t) => t.tagId) ?? []);
  const recentSolvedTitles = recentSolved.map((s) => s.problemRef?.title).filter((t): t is string => !!t);

  void institutionId;
  return {
    rating: rating?.displayed ?? 800,
    tagMastery: new Map(tagStats.map((t) => [t.tagId, t.mastery])),
    curriculumTagIds,
    recentTagIds,
    recentSolvedTitles,
  };
}

async function loadAttempts(userId: string): Promise<Map<string, AttemptState>> {
  const [solved, lastAttempts] = await Promise.all([
    prisma.solvedProblem.findMany({ where: { userId, problemRefId: { not: null } }, select: { problemRefId: true } }),
    prisma.submission.groupBy({
      by: ["problemRefId"],
      where: { userId, problemRefId: { not: null } },
      _max: { createdAt: true },
    }),
  ]);
  const solvedIds = new Set(solved.map((s) => s.problemRefId));
  const attempts = new Map<string, AttemptState>();
  for (const row of lastAttempts) {
    if (!row.problemRefId) continue;
    attempts.set(row.problemRefId, {
      attempted: true,
      solved: solvedIds.has(row.problemRefId),
      lastAttemptAt: row._max.createdAt ?? null,
    });
  }
  return attempts;
}

/** Phase A: score every active student against every candidate problem,
 * persist the top 20 (score only), and submit one Batch API request per
 * row for the one-line rationale. Returns immediately — the batch is
 * polled by a later tick. */
export async function submitRecommendationBatch(): Promise<{ students: number; requests: number }> {
  const [candidates, students] = await Promise.all([
    loadCandidateProblems(),
    prisma.user.findMany({ where: { role: "STUDENT", status: "ACTIVE" }, select: { id: true, institutionId: true } }),
  ]);
  if (candidates.length === 0 || students.length === 0) return { students: 0, requests: 0 };

  const problemById = new Map(candidates.map((c) => [c.id, c]));
  const requests: { custom_id: string; params: Parameters<typeof anthropic.messages.batches.create>[0]["requests"][number]["params"] }[] = [];

  for (const student of students) {
    const [context, attempts] = await Promise.all([
      loadStudentContext(student.id, student.institutionId),
      loadAttempts(student.id),
    ]);
    const ranked = rankCandidates(candidates, context, attempts).slice(0, TOP_N);

    await prisma.$transaction(
      ranked.map((r) =>
        prisma.problemRecommendation.upsert({
          where: { userId_problemId: { userId: student.id, problemId: r.problemId } },
          create: { userId: student.id, problemId: r.problemId, score: r.score.total, reason: "" },
          update: { score: r.score.total, computedAt: new Date() },
        })
      )
    );

    const weakestTags = [...context.tagMastery.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([tagId]) => tagId);
    for (const r of ranked) {
      const problem = problemById.get(r.problemId);
      if (!problem) continue;
      const prompt = buildRecommendExplainPrompt({
        problemTitle: problem.title,
        problemTags: problem.tags.map((t) => t.tagId),
        studentRecentSolvedTitles: context.recentSolvedTitles,
        weakestTags,
        difficultyDeltaFromRating: problem.elo - context.rating,
      });
      requests.push({
        custom_id: `${student.id}${CUSTOM_ID_SEP}${r.problemId}`,
        params: {
          model: MODEL,
          max_tokens: 300,
          output_config: { effort: "medium", format: zodOutputFormat(RecommendExplainOutputSchema) },
          system: prompt.system,
          messages: prompt.messages,
        },
      });
    }
  }

  if (requests.length === 0) return { students: students.length, requests: 0 };

  const batch = await anthropic.messages.batches.create({ requests });

  const redis = getRedis();
  if (redis) await redis.set(PENDING_BATCH_KEY, JSON.stringify({ batchId: batch.id, submittedAt: Date.now() }));
  else log.warn("recommend batch submitted without redis — pollRecommendationBatch will not find it next tick", { batchId: batch.id });

  await prisma.aiJob.create({
    data: {
      kind: RECOMMEND_KIND,
      status: "RUNNING",
      requestedById: "system",
      institutionId: null,
      inputHash: batch.id,
      input: { batchId: batch.id, requestCount: requests.length },
      model: MODEL,
    },
  });

  return { students: students.length, requests: requests.length };
}

/** Phase B: poll the pending batch; once ended, write each rationale onto
 * its ProblemRecommendation row by custom_id. */
export async function pollRecommendationBatch(): Promise<{ polled: boolean; applied: number }> {
  const redis = getRedis();
  if (!redis) return { polled: false, applied: 0 };

  const raw = await redis.get(PENDING_BATCH_KEY);
  if (!raw) return { polled: false, applied: 0 };
  const { batchId } = JSON.parse(raw) as { batchId: string };

  const batch = await anthropic.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") return { polled: true, applied: 0 };

  let applied = 0;
  let totalCostCents = 0;
  const results = await anthropic.messages.batches.results(batchId);
  for await (const entry of results) {
    const [userId, problemId] = entry.custom_id.split(CUSTOM_ID_SEP);
    if (!userId || !problemId) continue;
    if (entry.result.type !== "succeeded") continue;

    const message = entry.result.message;
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || !("text" in textBlock)) continue;
    let reason = "";
    try {
      reason = RecommendExplainOutputSchema.parse(JSON.parse(textBlock.text)).reason;
    } catch {
      continue;
    }
    totalCostCents += summarizeUsage(message.usage).costCents;

    await prisma.problemRecommendation
      .update({ where: { userId_problemId: { userId, problemId } }, data: { reason } })
      .catch(() => undefined); // the recommendation row may have rotated out between submit and now
    applied++;
  }

  await redis.del(PENDING_BATCH_KEY);
  await prisma.aiJob.updateMany({
    where: { kind: RECOMMEND_KIND, inputHash: batchId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), costCents: totalCostCents },
  });

  return { polled: true, applied };
}
