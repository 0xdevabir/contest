export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contestStatusLabel } from "@/lib/contests";
import { AdminContestCreate } from "@/components/admin/AdminContestCreate";
import { AdminContestActions } from "@/components/admin/AdminContestActions";
import { getAllProblemIds, getProblem } from "@/lib/problems";

export default async function AdminPage() {
  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  let contests: Awaited<ReturnType<typeof list>> = [];
  try {
    contests = await list();
  } catch {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--warn)]">
        Database not connected. Set Neon DATABASE_URL and run <code>npm run db:push</code>.
      </div>
    );
  }

  const problemOptions = getAllProblemIds().map((id) => {
    const p = getProblem(id)!;
    return {
      id,
      label: `Set ${p.set} Q${p.question}: ${p.title}`,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-700">Admin</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Create contests, set duration/rules, then go live.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl font-600">Create contest</h2>
        <AdminContestCreate problems={problemOptions} />
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-600">All contests</h2>
        <div className="mt-4 space-y-4">
          {contests.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No contests yet.</p>
          )}
          {contests.map((c) => (
            <article key={c.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-[var(--accent)]">
                    {contestStatusLabel(c.status)}
                  </p>
                  <h3 className="font-display text-lg font-600">{c.title}</h3>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                    {c.durationMinutes} min · {c._count.problems} problems ·{" "}
                    {c._count.registrations} regs · slug {c.slug}
                  </p>
                  <Link
                    href={`/contests/${c.slug}`}
                    className="mt-2 inline-block text-xs text-[var(--accent)]"
                  >
                    Public page →
                  </Link>
                </div>
                <AdminContestActions
                  contestId={c.id}
                  status={c.status}
                  durationMinutes={c.durationMinutes}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function list() {
  return prisma.contest.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { problems: true, registrations: true } } },
  });
}
