import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { getAllProblemIds, getProblem } from "@/lib/problems";
import { getProblemSolvers } from "@/lib/solvers";
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
  searchParams: Promise<{ contest?: string }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getAllProblemIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const problem = getProblem(id);
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
  const { contest } = await searchParams;
  const problem = getProblem(id);
  if (!problem) notFound();

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
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

  const ids = getAllProblemIds();
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
        prevId={prevId}
        nextId={nextId}
        contestId={contest || null}
        loggedIn={Boolean(session)}
        currentUserId={session?.id ?? null}
        initialSolvers={solvers.solvers}
        initialSolverCount={solvers.total}
      />
    </>
  );
}
