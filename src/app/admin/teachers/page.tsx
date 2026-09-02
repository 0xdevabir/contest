export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { TeacherApprovalQueue } from "@/components/admin/TeacherApprovalQueue";

export default async function AdminTeachersPage() {
  const pending = await prisma.user.findMany({
    where: { role: "TEACHER", teacherApprovedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      teacherRequestNote: true,
      createdAt: true,
      emailVerified: true,
      institution: { select: { name: true, shortName: true } },
    },
  });

  const approved = await prisma.user.findMany({
    where: { role: "TEACHER", teacherApprovedAt: { not: null } },
    orderBy: { teacherApprovedAt: "desc" },
    take: 20,
    select: {
      id: true,
      name: true,
      email: true,
      teacherApprovedAt: true,
      institution: { select: { shortName: true } },
    },
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          People
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Teacher approvals</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Teacher signups can&apos;t create contests or problems until approved here.
        </p>
      </header>

      <div className="mt-7">
        <TeacherApprovalQueue
          pending={pending.map((p) => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
            emailVerified: Boolean(p.emailVerified),
          }))}
        />
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold">Recently approved</h2>
        <div className="panel mt-4 divide-y divide-[var(--line-soft)] overflow-hidden">
          {approved.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">
              No approvals yet.
            </p>
          ) : (
            approved.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                    {t.email} · {t.institution?.shortName ?? "Unaffiliated"}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-[var(--muted)]">
                  {t.teacherApprovedAt?.toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
