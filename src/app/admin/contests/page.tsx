import Link from "next/link";
import type { ContestStatus, Prisma } from "@prisma/client";
import { Calendar, ChevronRight, Plus, Search, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { AdminContestActions } from "@/components/admin/AdminContestActions";

type Props = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

const statuses: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "LIVE", label: "Live" },
  { value: "ENDED", label: "Ended" },
];

export default async function AdminContestsPage({ searchParams }: Props) {
  const { q = "", status = "" } = await searchParams;
  const validStatus = ["DRAFT", "SCHEDULED", "LIVE", "ENDED"].includes(status)
    ? (status as ContestStatus)
    : undefined;
  const where: Prisma.ContestWhereInput = {
    ...(validStatus ? { status: validStatus } : {}),
    ...(q.trim()
      ? {
          OR: [
            { title: { contains: q.trim(), mode: "insensitive" } },
            { slug: { contains: q.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [contests, counts] = await Promise.all([
    prisma.contest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { problems: true, registrations: true, submissions: true } },
      },
    }),
    prisma.contest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countMap = new Map(counts.map((row) => [row.status, row._count._all]));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Competition operations
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">Contests</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Configure, schedule, launch, and monitor every contest.
          </p>
        </div>
        <Link href="/admin/contests/new" className="btn btn-primary !py-2 !text-xs">
          <Plus size={14} aria-hidden="true" />
          Create contest
        </Link>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statuses.slice(1).map((item) => (
          <Link
            key={item.value}
            href={`/admin/contests?status=${item.value}`}
            className={`rounded-xl border p-4 transition-colors ${
              status === item.value
                ? "border-[var(--accent-dim)] bg-[var(--accent-surface)]"
                : "border-[var(--line)] bg-[var(--bg-panel)] hover:border-[var(--accent-dim)]"
            }`}
          >
            <p className="text-xs text-[var(--muted)]">{item.label}</p>
            <p className="mt-2 font-display text-2xl font-bold">
              {countMap.get(item.value as ContestStatus) ?? 0}
            </p>
          </Link>
        ))}
      </section>

      <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <form className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] p-3">
          <label className="relative min-w-56 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden="true"
            />
            <span className="sr-only">Search contests</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by title or slug…"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] py-2 pl-9 pr-3 text-xs outline-none focus:border-[var(--accent-dim)]"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto">
            {statuses.map((item) => (
              <Link
                key={item.value}
                href={`/admin/contests${item.value ? `?status=${item.value}` : ""}`}
                className={`shrink-0 rounded-md px-3 py-2 text-xs ${
                  (status || "") === item.value
                    ? "bg-[var(--hover)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </form>

        <div className="divide-y divide-[var(--line)]">
          {contests.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Trophy className="mx-auto text-[var(--muted)]" size={28} />
              <h2 className="mt-3 text-sm font-semibold">No contests found</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Change the filters or create a new contest.
              </p>
            </div>
          ) : (
            contests.map((contest) => (
              <article
                key={contest.id}
                className="grid gap-4 px-4 py-4 transition-colors hover:bg-[var(--hover)] lg:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={contest.status} />
                    <Link
                      href={`/admin/contests/${contest.id}`}
                      className="truncate font-display text-base font-bold hover:text-[var(--accent)]"
                    >
                      {contest.title}
                    </Link>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-[var(--muted)]">
                    /{contest.slug}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
                    <span>{contest._count.problems} problems</span>
                    <span>{contest._count.registrations} registrations</span>
                    <span>{contest._count.submissions} submissions</span>
                  </div>
                </div>
                <div className="flex min-w-48 items-center gap-3 text-xs text-[var(--muted)]">
                  <Calendar size={14} aria-hidden="true" />
                  <div>
                    <p>{contest.startsAt ? formatDate(contest.startsAt) : "Not scheduled"}</p>
                    <p className="mt-0.5 font-mono text-[10px]">
                      {contest.durationMinutes} minutes
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <AdminContestActions
                    contestId={contest.id}
                    status={contest.status}
                    durationMinutes={contest.durationMinutes}
                    compact
                  />
                  <Link
                    href={`/admin/contests/${contest.id}`}
                    className="grid size-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
                    aria-label={`Edit ${contest.title}`}
                  >
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ContestStatus }) {
  const classes = {
    LIVE: "border-[var(--accent-dim)] bg-[var(--accent-surface)] text-[var(--accent)]",
    SCHEDULED: "border-[var(--warn)]/30 bg-[var(--warn-surface)] text-[var(--warn)]",
    DRAFT: "border-[var(--line)] bg-[var(--hover)] text-[var(--muted)]",
    ENDED: "border-[var(--line)] bg-[var(--sunken)] text-[var(--muted)]",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${classes[status]}`}>
      {status}
    </span>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
