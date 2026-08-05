import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Trophy,
  Braces,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getProblem } from "@/lib/problems";
import { universityLabel } from "@/lib/universities";
import { UserActions } from "@/components/admin/UserActions";

type Props = { params: Promise<{ id: string }> };

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      university: true,
      studentId: true,
      department: true,
      role: true,
      status: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
      _count: {
        select: {
          submissions: true,
          solvedProblems: true,
          contestRegs: true,
        },
      },
    },
  });
  if (!user) notFound();

  const [submissions, solves, contests, audit] = await Promise.all([
    prisma.submission.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        problemId: true,
        verdict: true,
        timeMs: true,
        createdAt: true,
        contest: { select: { title: true, slug: true } },
      },
    }),
    prisma.solvedProblem.findMany({
      where: { userId: id },
      orderBy: { firstSolvedAt: "desc" },
      take: 20,
    }),
    prisma.contestRegistration.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: {
        contest: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
    }),
    prisma.adminAuditLog.findMany({
      where: { OR: [{ actorId: id }, { targetType: "user", targetId: id }] },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const accepted = submissions.filter((s) => s.verdict === "AC").length;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6 lg:px-8">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} aria-hidden />
        All users
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-white/[0.05] font-display text-lg font-bold">
            {initials(user.name)}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold">{user.name}</h1>
              {user.id === session?.id && (
                <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                  YOU
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Pill>{universityLabel(user.university)}</Pill>
              <Pill tone={user.role === "ADMIN" ? "accent" : "muted"}>{user.role}</Pill>
              <Pill tone={user.status === "SUSPENDED" ? "warn" : "muted"}>{user.status}</Pill>
              <Pill tone={user.emailVerified ? "accent" : "warn"}>
                {user.emailVerified ? "Verified" : "Unverified"}
              </Pill>
            </div>
          </div>
        </div>
        <UserActions
          userId={user.id}
          role={user.role}
          status={user.status}
          verified={Boolean(user.emailVerified)}
          isSelf={user.id === session?.id}
          redirectOnDelete="/admin/users"
        />
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Braces} label="Submissions" value={user._count.submissions} />
        <Metric icon={CheckCircle2} label="Problems solved" value={user._count.solvedProblems} />
        <Metric icon={Trophy} label="Contest entries" value={user._count.contestRegs} />
        <Metric
          icon={Clock3}
          label="Recent AC rate"
          value={
            submissions.length
              ? `${Math.round((accepted / submissions.length) * 100)}%`
              : "—"
          }
        />
      </section>

      <section className="panel mt-5 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Student ID" value={user.studentId || "—"} />
        <Field label="Department" value={user.department || "—"} />
        <Field label="Joined" value={formatDate(user.createdAt)} />
        <Field
          label="Last login"
          value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}
        />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <SectionTitle title="Recent submissions" href={`/admin/submissions?q=${encodeURIComponent(user.email)}`} />
          <div className="divide-y divide-[var(--line-soft)]">
            {submissions.length === 0 ? (
              <Empty text="No submissions yet." />
            ) : (
              submissions.map((sub) => {
                const problem = getProblem(sub.problemId);
                return (
                  <Link
                    key={sub.id}
                    href={`/admin/submissions/${sub.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <VerdictBadge verdict={sub.verdict} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {problem?.title ?? sub.problemId}
                        {sub.contest ? (
                          <span className="text-[var(--muted)]"> · {sub.contest.title}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                        {sub.problemId}
                        {sub.timeMs != null ? ` · ${sub.timeMs}ms` : ""} ·{" "}
                        {relativeTime(sub.createdAt)}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <SectionTitle title="Solved problems" />
          <div className="divide-y divide-[var(--line-soft)]">
            {solves.length === 0 ? (
              <Empty text="No solved problems yet." />
            ) : (
              solves.map((solve) => {
                const problem = getProblem(solve.problemId);
                return (
                  <div key={solve.problemId} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{problem?.title ?? solve.problemId}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                        {solve.problemId} · ×{solve.solveCount}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-[var(--muted)]">
                      {relativeTime(solve.firstSolvedAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <SectionTitle title="Contest registrations" href="/admin/contests" />
          <div className="divide-y divide-[var(--line-soft)]">
            {contests.length === 0 ? (
              <Empty text="Not registered for any contest." />
            ) : (
              contests.map((reg) => (
                <Link
                  key={reg.contestId}
                  href={`/admin/contests/${reg.contest.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{reg.contest.title}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      Joined {formatDate(reg.createdAt)}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase text-[var(--muted)]">
                    {reg.contest.status}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <SectionTitle title="Related audit events" href="/admin/system" />
          <div className="divide-y divide-[var(--line-soft)]">
            {audit.length === 0 ? (
              <Empty text="No audit events for this user." />
            ) : (
              audit.map((row) => (
                <div key={row.id} className="px-5 py-3">
                  <p className="text-sm">
                    <span className="font-mono text-[11px] text-[var(--accent)]">{row.action}</span>
                    {row.actor ? (
                      <span className="text-[var(--muted)]"> · by {row.actor.name}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {row.targetType}/{row.targetId} · {relativeTime(row.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Braces;
  label: string;
  value: number | string;
}) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <Icon size={16} className="text-[var(--muted)]" aria-hidden />
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted-dim)]">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
      <h2 className="font-display text-base font-bold">{title}</h2>
      {href ? (
        <Link href={href} className="text-xs text-[var(--accent)] hover:underline">
          View all
        </Link>
      ) : null}
    </div>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "warn";
}) {
  const styles =
    tone === "accent"
      ? "border-[var(--accent-dim)] text-[var(--accent)] bg-[rgba(62,207,142,0.08)]"
      : tone === "warn"
        ? "border-[var(--warn)]/40 text-[var(--warn)] bg-[rgba(240,180,41,0.08)]"
        : "border-[var(--line)] text-[var(--muted)]";
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono uppercase ${styles}`}>{children}</span>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const ok = verdict === "AC";
  return (
    <span
      className={`grid h-6 min-w-8 place-items-center rounded border px-1.5 font-mono text-[10px] font-semibold ${
        ok
          ? "border-[var(--accent-dim)] bg-[rgba(62,207,142,0.09)] text-[var(--accent)]"
          : "border-[var(--line)] bg-white/[0.03] text-[var(--warn)]"
      }`}
    >
      {verdict}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-xs text-[var(--muted)]">{text}</div>;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(date: Date) {
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
