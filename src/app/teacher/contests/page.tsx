import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function TeacherContestsPage() {
  const session = await getSession();

  const contests = await prisma.contest.findMany({
    where: { OR: [{ createdById: session!.id }, { staff: { some: { userId: session!.id } } }] },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { registrations: true, problems: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Your contests</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Contests you own or staff. New ones default to private — promote to
            public once you&rsquo;re ready.
          </p>
        </div>
        <Link href="/teacher/contests/new" className="btn btn-primary !text-xs">
          <Plus size={14} aria-hidden /> New contest
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Visibility</th>
              <th className="px-4 py-3 font-medium">Problems</th>
              <th className="px-4 py-3 font-medium">Registrations</th>
              <th className="px-4 py-3 text-right font-medium">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {contests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">
                  No contests yet.
                </td>
              </tr>
            )}
            {contests.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">{c.title}</td>
                <td className="px-4 py-3">{c.status}</td>
                <td className="px-4 py-3">{c.visibility}</td>
                <td className="px-4 py-3">{c._count.problems}</td>
                <td className="px-4 py-3">{c._count.registrations}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/teacher/contests/${c.id}`} className="text-[var(--accent)] hover:underline">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
