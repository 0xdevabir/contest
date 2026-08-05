import { notFound } from "next/navigation";
import { getAllProblemIds, getProblem } from "@/lib/problems";
import { ProblemWorkspace } from "@/components/ProblemWorkspace";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contest?: string }>;
};

export function generateStaticParams() {
  return getAllProblemIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const problem = getProblem(id);
  return {
    title: problem ? problem.title : "Problem",
  };
}

export default async function ProblemPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { contest } = await searchParams;
  const problem = getProblem(id);
  if (!problem) notFound();

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
    />
  );
}

