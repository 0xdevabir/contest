import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Code2,
  Radio,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { universityLabel } from "@/lib/universities";

export default async function AdminPage() {
  try {
    const data = await getDashboardData();
    return <Dashboard data={data} />;
  } catch {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-xl border border-[var(--warn)]/30 bg-[rgba(240,180,41,0.07)] p-5">
          <h1 className="font-display text-xl font-bold text-[var(--warn)]">
            Database connection unavailable
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Check the Neon <code>DATABASE_URL</code>, then run{" "}
            <code>npm run db:push</code>.
          </p>
        </div>
      </div>
    );
  }
}

async function getDashboardData() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    verifiedUsers,
    totalContests,
    liveContests,
    totalSubmissions,
    acceptedSubmissions,
    registrations,
    universityGroups,
    recentUsers,
    recentSubmissions,
    liveContestRows,
    recentSubmissionDates,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.contest.count(),
    prisma.contest.count({ where: { status: "LIVE" } }),
    prisma.submission.count(),
    prisma.submission.count({ where: { verdict: "AC" } }),
    prisma.contestRegistration.count(),
    prisma.user.groupBy({
      by: ["university"],
      _count: { _all: true },
      orderBy: { _count: { university: "desc" } },
    }),
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        university: true,
        emailVerified: true,
        createdAt: true,
      },
    }),
    prisma.submission.findMany({
      take: 7,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        problemId: true,
        verdict: true,
        timeMs: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.contest.findMany({
      where: { status: { in: ["LIVE", "SCHEDULED"] } },
      take: 4,
      orderBy: [{ status: "asc" }, { startsAt: "asc" }],
      include: {
        _count: { select: { registrations: true, submissions: true } },
      },
    }),
    prisma.submission.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return {
      label: date.toLocaleDateString("en", { weekday: "short" }),
      count: recentSubmissionDates.filter(
        (row) => row.createdAt >= date && row.createdAt < next
      ).length,
    };
  });

  return {
    totalUsers,
    verifiedUsers,
    totalContests,
    liveContests,
    totalSubmissions,
    acceptedSubmissions,
    registrations,
    universityGroups,
    recentUsers,
    recentSubmissions,
    liveContestRows,
    daily,
  };
}

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function Dashboard({ data }: { data: DashboardData }) {
  const acceptanceRate = data.totalSubmissions
    ? Math.round((data.acceptedSubmissions / data.totalSubmissions) * 100)
    : 0;
  const verifiedRate = data.totalUsers
    ? Math.round((data.verifiedUsers / data.totalUsers) * 100)
    : 0;
  const chartMax = Math.max(...data.daily.map((day) => day.count), 1);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            <Radio size={13} className="animate-pulse" aria-hidden="true" />
            Operations online
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Platform overview
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Users, contests, submissions, and platform health at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/users" className="btn btn-ghost !py-2 !text-xs">
            <Users size={14} aria-hidden="true" />
            Manage users
          </Link>
          <Link href="/admin/contests/new" className="btn btn-primary !py-2 !text-xs">
            <Trophy size={14} aria-hidden="true" />
            New contest
          </Link>
        </div>
      </header>

      <section aria-label="Platform metrics" className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Registered users"
          value={data.totalUsers}
          detail={`${verifiedRate}% email verified`}
          icon={Users}
        />
        <MetricCard
          label="Total submissions"
          value={data.totalSubmissions}
          detail={`${acceptanceRate}% acceptance rate`}
          icon={Code2}
        />
        <MetricCard
          label="Active contests"
          value={data.liveContests}
          detail={`${data.totalContests} contests total`}
          icon={Trophy}
          emphasis
        />
        <MetricCard
          label="Contest entries"
          value={data.registrations}
          detail="All-time registrations"
          icon={ShieldCheck}
        />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <section className="panel p-5" aria-labelledby="submission-activity">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="submission-activity" className="font-display text-lg font-bold">
                Submission activity
              </h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Last seven days</p>
            </div>
            <Link
              href="/admin/submissions"
              className="inline-flex items-center gap-1 text-xs text-[var(--accent)]"
            >
              View all <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-6 flex h-48 items-end gap-2 sm:gap-4">
            {data.daily.map((day) => (
              <div key={day.label} className="flex h-full flex-1 flex-col justify-end">
                <div className="mb-1 text-center font-mono text-[10px] text-[var(--muted)]">
                  {day.count}
                </div>
                <div
                  className="min-h-1 rounded-t bg-[var(--accent)] opacity-80 transition-[height] duration-500"
                  style={{ height: `${Math.max((day.count / chartMax) * 100, 3)}%` }}
                  title={`${day.count} submissions`}
                />
                <div className="mt-2 text-center text-[10px] text-[var(--muted)]">
                  {day.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5" aria-labelledby="university-distribution">
          <h2 id="university-distribution" className="font-display text-lg font-bold">
            University distribution
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Registered users</p>
          <div className="mt-5 space-y-4">
            {data.universityGroups.map((group) => {
              const percentage = data.totalUsers
                ? Math.round((group._count._all / data.totalUsers) * 100)
                : 0;
              return (
                <div key={group.university}>
                  <div className="mb-1.5 flex justify-between gap-3 text-xs">
                    <span className="truncate">{universityLabel(group.university)}</span>
                    <span className="font-mono text-[var(--muted)]">
                      {group._count._all} · {percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                    <div
                      className="h-full rounded-full bg-[var(--info)]"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="panel overflow-hidden" aria-labelledby="contest-watch">
          <SectionHeader
            id="contest-watch"
            title="Contest watch"
            subtitle="Live and scheduled operations"
            href="/admin/contests"
          />
          <div className="divide-y divide-[var(--line)]">
            {data.liveContestRows.length === 0 ? (
              <EmptyRow text="No live or scheduled contests." />
            ) : (
              data.liveContestRows.map((contest) => (
                <Link
                  key={contest.id}
                  href={`/admin/contests/${contest.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.025]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot live={contest.status === "LIVE"} />
                      <p className="truncate text-sm font-medium">{contest.title}</p>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                      {contest._count.registrations} participants ·{" "}
                      {contest._count.submissions} submissions
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-[var(--muted)]">
                    {contest.status}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="panel overflow-hidden" aria-labelledby="recent-submissions">
          <SectionHeader
            id="recent-submissions"
            title="Recent submissions"
            subtitle="Latest judge activity"
            href="/admin/submissions"
          />
          <div className="divide-y divide-[var(--line)]">
            {data.recentSubmissions.length === 0 ? (
              <EmptyRow text="No submissions yet." />
            ) : (
              data.recentSubmissions.slice(0, 5).map((submission) => (
                <div key={submission.id} className="flex items-center gap-3 px-5 py-3">
                  <VerdictBadge verdict={submission.verdict} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {submission.user?.name ?? "Guest"}{" "}
                      <span className="text-[var(--muted)]">on</span>{" "}
                      <span className="font-mono text-xs">{submission.problemId}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {relativeTime(submission.createdAt)}
                      {submission.timeMs != null ? ` · ${submission.timeMs}ms` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="panel mt-5 overflow-hidden" aria-labelledby="new-users">
        <SectionHeader
          id="new-users"
          title="New users"
          subtitle="Most recent registrations"
          href="/admin/users"
        />
        <div className="grid divide-y divide-[var(--line)] md:grid-cols-5 md:divide-x md:divide-y-0">
          {data.recentUsers.map((user) => (
            <Link
              key={user.id}
              href={`/admin/users/${user.id}`}
              className="px-4 py-4 transition-colors hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.05] text-xs font-semibold">
                  {initials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{user.name}</p>
                  <p className="font-mono text-[10px] text-[var(--muted)]">
                    {user.university}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-[10px] text-[var(--muted)]">
                {user.emailVerified ? (
                  <CheckCircle2 size={11} className="text-[var(--accent)]" aria-hidden="true" />
                ) : (
                  <Clock3 size={11} className="text-[var(--warn)]" aria-hidden="true" />
                )}
                {user.emailVerified ? "Verified" : "Pending verification"}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  emphasis = false,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Users;
  emphasis?: boolean;
}) {
  return (
    <article
      className={`rounded-xl border p-4 ${
        emphasis
          ? "border-[var(--accent-dim)] bg-[rgba(62,207,142,0.07)]"
          : "border-[var(--line)] bg-[var(--bg-panel)]"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
        <Icon
          size={17}
          className={emphasis ? "text-[var(--accent)]" : "text-[var(--muted)]"}
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[11px] text-[var(--muted)]">{detail}</p>
    </article>
  );
}

function SectionHeader({
  id,
  title,
  subtitle,
  href,
}: {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
      <div>
        <h2 id={id} className="font-display text-base font-bold">
          {title}
        </h2>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{subtitle}</p>
      </div>
      <Link href={href} aria-label={`View all ${title}`} className="text-[var(--muted)] hover:text-[var(--accent)]">
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function StatusDot({ live }: { live: boolean }) {
  return (
    <span
      className={`size-1.5 shrink-0 rounded-full ${
        live ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--warn)]"
      }`}
      aria-label={live ? "Live" : "Scheduled"}
    />
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const accepted = verdict === "AC";
  return (
    <span
      className={`grid h-6 min-w-8 place-items-center rounded border px-1.5 font-mono text-[10px] font-semibold ${
        accepted
          ? "border-[var(--accent-dim)] bg-[rgba(62,207,142,0.09)] text-[var(--accent)]"
          : "border-[var(--line)] bg-white/[0.03] text-[var(--warn)]"
      }`}
    >
      {verdict}
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-xs text-[var(--muted)]">{text}</div>
  );
}

function relativeTime(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}


