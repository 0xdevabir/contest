import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { prismaDifficultyToLabel } from "@/lib/difficulty";
import { ProblemEditor } from "@/components/problem/ProblemEditor";

type Props = { params: Promise<{ id: string }> };

export default async function EditTeacherProblemPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          groups: {
            orderBy: { order: "asc" },
            include: { cases: { orderBy: { order: "asc" }, select: { id: true, order: true, label: true, inputBytes: true, expectedBytes: true, manualExpected: true } } },
          },
          references: true,
        },
      },
    },
  });
  if (!problem) notFound();
  assertCan(session, "problem:edit", { ownerId: problem.authorId });

  const version = problem.versions[0];
  if (!version) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/teacher/problems" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden /> Your problems
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{problem.title}</h1>
          <p className="mt-1 font-mono text-xs text-[var(--muted)]">
            {problem.slug} · v{version.version} · {problem.status} · {prismaDifficultyToLabel(problem.difficulty)}
          </p>
        </div>
      </div>

      <ProblemEditor
        problem={{
          id: problem.id,
          slug: problem.slug,
          title: problem.title,
          status: problem.status,
          visibility: problem.visibility,
          difficulty: prismaDifficultyToLabel(problem.difficulty),
        }}
        version={{
          id: version.id,
          version: version.version,
          frozen: version.frozen,
          statementMd: version.statementMd,
          inputSpec: version.inputSpec,
          outputSpec: version.outputSpec,
          constraints: version.constraints,
          timeLimitMs: version.timeLimitMs,
          memoryLimitMb: version.memoryLimitMb,
          checkerType: version.checkerType,
        }}
        groups={version.groups.map((g) => ({
          id: g.id,
          order: g.order,
          name: g.name,
          points: g.points,
          isSample: g.isSample,
          cases: g.cases,
        }))}
        references={version.references.map((r) => ({
          id: r.id,
          language: r.language,
          expectedVerdict: r.expectedVerdict,
          lastVerdict: r.lastVerdict,
        }))}
      />
    </div>
  );
}
