import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Braces, ExternalLink, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { parseRules } from "@/lib/contests";
import { getAllProblemIds, getProblem } from "@/lib/problems";
import { ContestEditor } from "@/components/admin/ContestEditor";
import { AdminContestActions } from "@/components/admin/AdminContestActions";

type Props = { params: Promise<{ id: string }> };

export default async function ContestControlPage({ params }: Props) {
  const { id } = await params;
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      problems: { orderBy: { order: "asc" } },
      _count: { select: { registrations: true, submissions: true } },
    },
  });
  if (!contest) notFound();

  const accepted = await prisma.submission.count({
    where: { contestId: id, verdict: "AC" },
  });
  const rules = parseRules(contest.rules);
  const problems = getAllProblemIds().map((problemId) => {
    const problem = getProblem(problemId)!;
    return {
      id: problemId,
      title: problem.title,
      set: problem.set,
      question: problem.question,
      difficulty: problem.difficulty,
    };
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8">
      <Link
        href="/admin/contests"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        All contests
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={contest.status} />
            <span className="font-mono text-[10px] text-[var(--muted)]">
              /{contest.slug}
            </span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold">{contest.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Control scheduling, rules, problems, and live operations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/contests/${contest.slug}`}
            target="_blank"
            className="btn btn-ghost !py-2 !text-xs"
          >
            <ExternalLink size={13} aria-hidden="true" />
            Public page
          </Link>
          <AdminContestActions
            contestId={contest.id}
            status={contest.status}
            durationMinutes={contest.durationMinutes}
          />
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <ControlMetric
          icon={Users}
          label="Registrations"
          value={contest._count.registrations}
        />
        <ControlMetric
          icon={Braces}
          label="Submissions"
          value={contest._count.submissions}
        />
        <ControlMetric icon={Trophy} label="Accepted runs" value={accepted} />
      </section>

      <div className="mt-6">
        <ContestEditor
          problems={problems}
          initial={{
            id: contest.id,
            title: contest.title,
            description: contest.description,
            durationMinutes: contest.durationMinutes,
            startsAt: toLocalInput(contest.startsAt),
            endsAt: toLocalInput(contest.endsAt),
            problemIds: contest.problems.map((problem) => problem.problemId),
            rules: {
              freezeMinutes: rules.freezeMinutes,
              penaltyPerWrong: rules.penaltyPerWrong,
              maxSubmissionsPerProblem: rules.maxSubmissionsPerProblem,
              allowPracticeAfter: rules.allowPracticeAfter,
              showSamples: rules.showSamples,
              notes: rules.notes ?? "",
            },
          }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded border px-2 py-1 font-mono text-[9px] font-semibold ${
        status === "LIVE"
          ? "border-[var(--accent-dim)] bg-[var(--accent-surface)] text-[var(--accent)]"
          : status === "SCHEDULED"
            ? "border-[var(--warn)]/30 text-[var(--warn)]"
            : "border-[var(--line)] text-[var(--muted)]"
      }`}
    >
      {status}
    </span>
  );
}

function ControlMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <Icon size={15} className="text-[var(--muted)]" aria-hidden="true" />
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

function toLocalInput(value: Date | null) {
  if (!value) return "";
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
