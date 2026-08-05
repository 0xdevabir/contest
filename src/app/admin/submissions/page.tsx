import Link from "next/link";
import type { Prisma, Verdict } from "@prisma/client";
import { Braces, CheckCircle2, Search, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getProblem } from "@/lib/problems";

type Props = {
  searchParams: Promise<{
    q?: string;
    verdict?: string;
    contest?: string;
    page?: string;
  }>;
};

const verdicts: Verdict[] = ["AC", "WA", "CE", "RE", "TLE", "MLE", "SKIP", "ERROR"];
const pageSize = 30;

export default async function AdminSubmissionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const verdict = verdicts.includes(params.verdict as Verdict)
    ? (params.verdict as Verdict)
    : undefined;
  const where: Prisma.SubmissionWhereInput = {
    ...(verdict ? { verdict } : {}),
    ...(params.contest ? { contestId: params.contest } : {}),
    ...(params.q?.trim()
      ? {
          OR: [
            { problemId: { contains: params.q.trim(), mode: "insensitive" } },
            { user: { name: { contains: params.q.trim(), mode: "insensitive" } } },
            { user: { email: { contains: params.q.trim(), mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [submissions, total, accepted, failed, contests] = await Promise.all([
    prisma.submission.findMany({
      where,
      take: pageSize,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true, university: true } },
        contest: { select: { title: true } },
      },
    }),
    prisma.submission.count({ where }),
    prisma.submission.count({ where: { verdict: "AC" } }),
    prisma.submission.count({
      where: { verdict: { in: ["WA", "CE", "RE", "TLE", "MLE", "ERROR"] } },
    }),
    prisma.contest.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Judge observability
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Submissions</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Inspect verdicts, execution time, source code, compiler output, and contest context.
        </p>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-3">
        <Metric icon={Braces} label="Matching runs" value={total} />
        <Metric icon={CheckCircle2} label="Accepted all-time" value={accepted} tone="success" />
        <Metric icon={XCircle} label="Failed all-time" value={failed} tone="danger" />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <form className="grid gap-2 border-b border-[var(--line)] p-3 md:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
          <label className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden="true"
            />
            <span className="sr-only">Search submissions</span>
            <input
              name="q"
              defaultValue={params.q}
              placeholder="User, email, or problem ID…"
              className="w-full rounded-lg border border-[var(--line)] bg-[#0a0f16] py-2 pl-9 pr-3 text-xs outline-none focus:border-[var(--accent-dim)]"
            />
          </label>
          <label>
            <span className="sr-only">Verdict</span>
            <select
              name="verdict"
              defaultValue={params.verdict || ""}
              className="w-full rounded-lg border border-[var(--line)] bg-[#0a0f16] px-3 py-2 text-xs"
            >
              <option value="">All verdicts</option>
              {verdicts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Contest</span>
            <select
              name="contest"
              defaultValue={params.contest || ""}
              className="max-w-56 rounded-lg border border-[var(--line)] bg-[#0a0f16] px-3 py-2 text-xs"
            >
              <option value="">Practice + all contests</option>
              {contests.map((contest) => (
                <option key={contest.id} value={contest.id}>
                  {contest.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-ghost !py-2 !text-xs">
            Apply
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Verdict</th>
                <th className="px-4 py-3 font-medium">Participant</th>
                <th className="px-4 py-3 font-medium">Problem</th>
                <th className="px-4 py-3 font-medium">Context</th>
                <th className="px-4 py-3 font-medium">Runtime</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 text-right font-medium">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {submissions.map((submission) => {
                const problem = getProblem(submission.problemId);
                return (
                  <tr key={submission.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <VerdictBadge verdict={submission.verdict} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{submission.user?.name ?? "Guest"}</p>
                      <p className="mt-0.5 max-w-52 truncate text-[10px] text-[var(--muted)]">
                        {submission.user?.email ?? "Anonymous submission"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-64 truncate">{problem?.title ?? submission.problemId}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                        {submission.problemId}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {submission.contest?.title ?? "Practice"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--muted)]">
                      {submission.timeMs != null ? `${submission.timeMs}ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {relativeTime(submission.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/submissions/${submission.id}`}
                        className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] hover:border-[var(--accent-dim)] hover:text-[var(--accent)]"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-[var(--muted)]">
                    No submissions match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          <span>
            {total.toLocaleString()} results · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <PageLink page={page - 1} disabled={page <= 1} params={params}>
              Previous
            </PageLink>
            <PageLink page={page + 1} disabled={page >= pages} params={params}>
              Next
            </PageLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const style =
    verdict === "AC"
      ? "border-[var(--accent-dim)] text-[var(--accent)]"
      : verdict === "WA"
        ? "border-[var(--danger)]/30 text-[var(--danger)]"
        : "border-[var(--warn)]/30 text-[var(--warn)]";
  return (
    <span className={`inline-flex min-w-10 justify-center rounded border px-2 py-1 font-mono text-[10px] font-semibold ${style}`}>
      {verdict}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Braces;
  label: string;
  value: number;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-[var(--accent)]"
      : tone === "danger"
        ? "text-[var(--danger)]"
        : "text-[var(--muted)]";
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex justify-between">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <Icon size={15} className={color} aria-hidden="true" />
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number;
  disabled: boolean;
  params: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="rounded-lg border border-[var(--line)] px-3 py-1.5 opacity-40">{children}</span>;
  }
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== "page") query.set(key, value);
  });
  query.set("page", String(page));
  return (
    <Link
      href={`/admin/submissions?${query}`}
      className="rounded-lg border border-[var(--line)] px-3 py-1.5 hover:text-[var(--text)]"
    >
      {children}
    </Link>
  );
}

function relativeTime(date: Date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
