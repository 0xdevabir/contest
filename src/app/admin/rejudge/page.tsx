import Link from "next/link";
import { prisma } from "@/lib/db";
import { RejudgeTrigger } from "@/components/admin/RejudgeTrigger";

export default async function RejudgeIndexPage() {
  const batches = await prisma.rejudgeBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Judge queue
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Rejudge</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Dry-run every affected submission, review the verdict diff, then apply — never edits a
          live verdict without a preview first.
        </p>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[20rem_1fr]">
        <RejudgeTrigger />

        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="border-b border-[var(--line)] bg-[var(--sunken)] text-[10px] uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Scope</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium">Progress</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/rejudge/${b.id}`} className="text-[var(--accent)] hover:underline">
                        {b.scope}: {b.scopeId}
                      </Link>
                    </td>
                    <td className="max-w-56 truncate px-4 py-2.5 text-[var(--muted)]">{b.reason}</td>
                    <td className="px-4 py-2.5 font-mono">
                      {b.completed}/{b.total}
                    </td>
                    <td className="px-4 py-2.5">{b.appliedAt ? "Applied" : b.dryRun ? "Dry run" : "Live"}</td>
                  </tr>
                ))}
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-[var(--muted)]">
                      No rejudge batches yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
