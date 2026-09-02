import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { slugify } from "./contests";
import { getProblem, getProblemRef } from "./problems";
import { ValidationError } from "./errors";

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Validates a problem-id list (exists, no duplicates) and resolves each to
 * its real `Problem`/`ProblemVersion` row, when DB-backed. Shared by admin
 * and teacher contest CRUD so the problem-set-replace transaction body only
 * lives once. */
export async function resolveContestProblems(
  problemIds: string[]
): Promise<Prisma.ContestProblemCreateManyContestInput[]> {
  const resolved = await Promise.all(problemIds.map(async (problemId) => [problemId, await getProblem(problemId)] as const));
  const invalid = resolved.find(([, problem]) => !problem)?.[0];
  if (invalid) throw new ValidationError(`Unknown problem: ${invalid}`);
  if (new Set(problemIds).size !== problemIds.length) throw new ValidationError("A problem can only be added once");

  const refs = new Map(await Promise.all(problemIds.map(async (id) => [id, await getProblemRef(id)] as const)));
  return problemIds.map((problemId, i) => {
    const ref = refs.get(problemId);
    return {
      problemId,
      order: i,
      points: 100,
      label: LABELS[i] || `P${i + 1}`,
      problemRefId: ref?.problemId ?? null,
      problemVersionId: ref?.versionId ?? null,
    };
  });
}

/** Replaces a contest's problem set inside a transaction — extracted from
 * the admin PATCH handler so admin and teacher routes share one
 * implementation (docs/phases/PHASE-05-contest-engine.md Stage 6). */
export async function replaceContestProblems(
  tx: Prisma.TransactionClient,
  contestId: string,
  problemIds: string[]
): Promise<void> {
  const rows = await resolveContestProblems(problemIds);
  await tx.contestProblem.deleteMany({ where: { contestId } });
  await tx.contestProblem.createMany({ data: rows.map((r) => ({ ...r, contestId })) });
}

export async function uniqueContestSlug(title: string): Promise<string> {
  let slug = slugify(title);
  if (!slug) slug = `contest-${Date.now().toString(36)}`;
  const exists = await prisma.contest.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;
  return slug;
}

/**
 * docs/phases/PHASE-05-contest-engine.md — clone a contest into a new draft:
 * same problems and settings, `clonedFromId` set, zero participations. Staff
 * (beyond the new owner) are copied only when `copyStaff` is true.
 */
export async function cloneContest(
  sourceId: string,
  actorId: string,
  opts: { copyStaff?: boolean; asTemplate?: boolean } = {}
) {
  const source = await prisma.contest.findUnique({
    where: { id: sourceId },
    include: { problems: { orderBy: { order: "asc" } }, staff: true },
  });
  if (!source) throw new ValidationError("Contest not found");

  const slug = await uniqueContestSlug(`${source.title} (Copy)`);

  return prisma.$transaction(async (tx) => {
    const clone = await tx.contest.create({
      data: {
        title: `${source.title} (Copy)`,
        slug,
        description: source.description,
        durationMinutes: source.durationMinutes,
        rules: source.rules as Prisma.InputJsonValue,
        status: "DRAFT",
        startsAt: null,
        endsAt: null,
        visibility: source.visibility,
        joinPolicy: source.joinPolicy,
        institutionId: source.institutionId,
        isTemplate: opts.asTemplate ?? false,
        clonedFromId: source.id,
        createdById: actorId,
        problems: {
          create: source.problems.map((p) => ({
            problemId: p.problemId,
            order: p.order,
            points: p.points,
            label: p.label,
            problemRefId: p.problemRefId,
            problemVersionId: p.problemVersionId,
          })),
        },
      },
      include: { problems: true },
    });

    await tx.contestStaff.create({
      data: { contestId: clone.id, userId: actorId, role: "OWNER", addedById: actorId },
    });

    if (opts.copyStaff) {
      const others = source.staff.filter((s) => s.userId !== actorId);
      if (others.length > 0) {
        await tx.contestStaff.createMany({
          data: others.map((s) => ({ contestId: clone.id, userId: s.userId, role: s.role, addedById: actorId })),
          skipDuplicates: true,
        });
      }
    }

    return clone;
  });
}
