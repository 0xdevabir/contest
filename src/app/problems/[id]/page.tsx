import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { getAllProblemIds, getProblem } from "@/lib/problems";
import { getProblemSolvers } from "@/lib/solvers";
import { ProblemWorkspace } from "@/components/ProblemWorkspace";

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
    .slice(0, 160);
  const description =
    `Solve "${problem.title}" — a ${problem.difficulty.toLowerCase()} C programming problem` +
    (problem.topic ? ` on ${problem.topic}. ` : ". ") +
    `Constraints: ${problem.constraints}. ${summary}`;
  return {
    title: `${problem.title} — ${problem.difficulty} C problem`,
    description,
    keywords: [
      `${problem.title} C solution`,
      `${problem.difficulty} C problem`,
      "C programming practice",
      "online judge",
      "competitive programming problem",
    ],
    alternates: { canonical: `/problems/${id}` },
    openGraph: {
      title: `${problem.title} — ${problem.difficulty} C problem`,
      description,
      url: `/problems/${id}`,
      type: "article",
    },
    twitter: {
      title: `${problem.title} — ${problem.difficulty} C problem`,
      description,
    },
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

  return (
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
  );
}
