import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { prismaDifficultyToLabel, difficultyClass } from "@/lib/difficulty";

export default async function TeacherProblemsPage() {
  const session = await getSession();
  // TAs are let into /teacher by the parent layout for section access only —
  // problem authoring is teacher/admin-only (authz.ts "problem:create").
  if (!can(session, "problem:create")) redirect("/teacher/sections");

  const problems = await prisma.problem.findMany({
    where: session!.role === "ADMIN" ? {} : { authorId: session!.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { versions: true } }, currentVersion: { select: { version: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Your problems</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Author statements, tests, and reference solutions, then submit for review.
          </p>
        </div>
        <Link href="/teacher/problems/new" className="btn btn-primary !text-xs">
          <Plus size={14} aria-hidden /> New problem
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Difficulty</th>
              <th className="px-4 py-3 font-medium">Versions</th>
              <th className="px-4 py-3 text-right font-medium">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {problems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[var(--muted)]">
                  No problems yet — create your first one.
                </td>
              </tr>
            ) : (
              problems.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--hover)]">
                  <td className="px-4 py-3.5">
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">{p.slug}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`font-mono text-[10px] uppercase ${difficultyClass(prismaDifficultyToLabel(p.difficulty))}`}>
                      {prismaDifficultyToLabel(p.difficulty)}
                    </span>
                  </td>
                  <td className="tnum px-4 py-3.5 font-mono text-[var(--muted)]">
                    v{p.currentVersion?.version ?? "—"} ({p._count.versions} total)
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Link href={`/teacher/problems/${p.id}/analytics`} className="mr-3 text-[var(--muted)] hover:text-[var(--text)] hover:underline">
                      Analytics
                    </Link>
                    <Link href={`/teacher/problems/${p.id}/edit`} className="text-[var(--accent)] hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    DRAFT: "text-[var(--muted)] border-[var(--line)]",
    IN_REVIEW: "text-amber-400 border-amber-400/30",
    PUBLISHED: "text-[var(--accent)] border-[var(--accent-dim)]",
    ARCHIVED: "text-[var(--muted-dim)] border-[var(--line)]",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${tone[status] ?? tone.DRAFT}`}>
      {status.replace("_", " ")}
    </span>
  );
}
