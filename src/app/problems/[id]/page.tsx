import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isContestOpen, parseRules } from "@/lib/contests";
import { getAllProblemIds, getProblem, getProblemRef } from "@/lib/problems";
import { getProblemSolvers } from "@/lib/solvers";
import { renderStatement } from "@/lib/statement";
import { isEnrolledStudent } from "@/lib/section-access";
import { getOrGenerateVariant } from "@/lib/integrity/variants/cache";
import { ProblemWorkspace } from "@/components/ProblemWorkspace";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  JsonLd,
  learningResourceJsonLd,
  pageKeywords,
} from "@/lib/seo";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contest?: string; assignment?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return (await getAllProblemIds()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const problem = await getProblem(id);
  if (!problem) {
    return {
      title: "Problem not found",
      robots: { index: false, follow: false },
    };
  }
  const summary = problem.statement
    .replace(/\s+/g, " ")
    .replace(/[#*_`>]/g, "")
    .trim()
    .slice(0, 140);
  const description =
    `Solve "${problem.title}" — a ${problem.difficulty.toLowerCase()} C programming practice problem` +
    (problem.topic ? ` on ${problem.topic}` : "") +
    ` on DIU ContestHub online judge. ${summary}`;
  const title = `${problem.title} — ${problem.difficulty} C programming problem`;
  return {
    ...buildPageMetadata({
      title,
      description,
      path: `/problems/${id}`,
      type: "article",
      keywords: [
        `${problem.title} C solution`,
        `${problem.title} C programming`,
        `${problem.difficulty} C problem`,
        problem.topic ? `${problem.topic} C practice` : "C programming practice",
        "online judge C problem",
        "competitive programming problem",
      ],
    }),
    keywords: pageKeywords(
      `${problem.title} C solution`,
      `${problem.difficulty} C problem`,
      problem.topic ?? "C programming practice",
      "online judge",
      "C practice problems"
    ),
  };
}

export default async function ProblemPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { contest, assignment } = await searchParams;
  const problem = await getProblem(id);
  if (!problem) notFound();
  let statementHtml = await renderStatement(problem.statement, id);

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  let contestContext: {
    id: string;
    title: string;
    slug: string;
    problemIds: string[];
    strictMode: boolean;
    participationId: string | null;
  } | null = null;

  if (contest) {
    if (!session) {
      redirect(
        `/login?next=${encodeURIComponent(`/problems/${id}?contest=${contest}`)}`
      );
    }

    const liveContest = await prisma.contest.findUnique({
      where: { id: contest },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        startsAt: true,
        endsAt: true,
        rules: true,
        problems: {
          orderBy: { order: "asc" },
          select: { problemId: true },
        },
        registrations: {
          where: { userId: session.id },
          take: 1,
          select: { id: true },
        },
        participations: {
          where: { userId: session.id, mode: "LIVE" },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!liveContest) notFound();

    const belongsToContest = liveContest.problems.some(
      (entry) => entry.problemId === id
    );
    const canCompete =
      liveContest.registrations.length > 0 &&
      isContestOpen(
        liveContest.status,
        liveContest.startsAt,
        liveContest.endsAt
      );

    // Never silently fall back to practice mode: that could make a contestant
    // think a submission counted when it did not.
    if (!belongsToContest || !canCompete) {
      redirect(`/contests/${liveContest.slug}`);
    }

    contestContext = {
      id: liveContest.id,
      title: liveContest.title,
      slug: liveContest.slug,
      problemIds: liveContest.problems.map((entry) => entry.problemId),
      strictMode: parseRules(liveContest.rules).strictMode,
      participationId: liveContest.participations[0]?.id ?? null,
    };
  }

  let assignmentContext: { id: string; sectionId: string } | null = null;

  if (assignment) {
    if (!session) {
      redirect(
        `/login?next=${encodeURIComponent(`/problems/${id}?assignment=${assignment}`)}`
      );
    }

    const liveAssignment = await prisma.assignment.findUnique({
      where: { id: assignment },
      select: {
        id: true,
        sectionId: true,
        published: true,
        problems: { select: { problemId: true } },
      },
    });

    if (!liveAssignment) notFound();

    const ref = await getProblemRef(id).catch(() => null);
    const belongsToAssignment = Boolean(
      ref && liveAssignment.problems.some((entry) => entry.problemId === ref.problemId)
    );
    const canWork =
      liveAssignment.published && (await isEnrolledStudent(session.id, liveAssignment.sectionId));

    // Same rule as the contest gate above: never fall back to an
    // unauthorized/unpublished view silently.
    if (!belongsToAssignment || !canWork) {
      redirect(`/courses/${liveAssignment.sectionId}/assignments/${liveAssignment.id}`);
    }

    assignmentContext = { id: liveAssignment.id, sectionId: liveAssignment.sectionId };
  }

  // Phase 10 D3 — per-student parameterised variants: swap in this
  // student's own statement/tests when this problem has a variant template
  // and we're in a contest or assignment context. Invisible/no-op for every
  // problem without a template (getOrGenerateVariant returns null fast).
  let variantProblemVersionId: string | null = null;
  if (session && (contestContext || assignmentContext)) {
    const ref = await getProblemRef(id).catch(() => null);
    if (ref) {
      const scopeType = contestContext ? ("contest" as const) : ("assignment" as const);
      const scopeId = contestContext ? contestContext.id : assignmentContext!.id;
      const variant = await getOrGenerateVariant({
        problemId: ref.problemId,
        userId: session.id,
        scopeType,
        scopeId,
      }).catch(() => null);
      if (variant) {
        statementHtml = await renderStatement(variant.statementMd, variant.problemVersionId);
        variantProblemVersionId = variant.problemVersionId;
      }
    }
  }

  let solvers: Awaited<ReturnType<typeof getProblemSolvers>> = {
    total: 0,
    solvers: [],
  };
  try {
    solvers = await getProblemSolvers(id);
  } catch (err) {
    console.error("problem solvers load failed", err);
  }

  const ids = contestContext?.problemIds ?? (await getAllProblemIds());
  const idx = ids.indexOf(id);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

  const summary = problem.statement.replace(/\s+/g, " ").trim().slice(0, 200);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Problems", path: "/problems" },
    { name: problem.title, path: `/problems/${id}` },
  ];

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs),
          learningResourceJsonLd({
            id: problem.id,
            title: problem.title,
            description: summary,
            difficulty: problem.difficulty,
            topic: problem.topic,
          }),
        ]}
      />
      <ProblemWorkspace
        problem={problem}
        statementHtml={statementHtml}
        prevId={prevId}
        nextId={nextId}
        contestId={contestContext?.id ?? null}
        contestHref={
          contestContext ? `/contests/${contestContext.slug}` : null
        }
        contestTitle={contestContext?.title ?? null}
        strictMode={contestContext?.strictMode ?? false}
        participationId={contestContext?.participationId ?? null}
        assignmentId={assignmentContext?.id ?? null}
        variantProblemVersionId={variantProblemVersionId}
        loggedIn={Boolean(session)}
        currentUserId={session?.id ?? null}
        initialSolvers={solvers.solvers}
        initialSolverCount={solvers.total}
      />
    </>
  );
}

