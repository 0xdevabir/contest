import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEnrolledStudent } from "@/lib/section-access";

type Props = { params: Promise<{ sectionId: string; aid: string }> };

const LATE_POLICY_COPY: Record<string, (param: number) => string> = {
  NONE: () => "Late submissions earn no credit.",
  LINEAR: (p) => `Late submissions lose ${p}% per day after the deadline.`,
  GRACE_THEN_LINEAR: (p) => `A ${p}-hour grace period, then 10%/day lost after that.`,
  REJECT: () => "Late submissions are not accepted.",
};

export default async function StudentAssignmentPage({ params }: Props) {
  const { sectionId, aid } = await params;
  const session = await getSession();
  if (!session) notFound();

  const enrolled = await isEnrolledStudent(session.id, sectionId);
  if (!enrolled) notFound();

  const assignment = await prisma.assignment.findUnique({
    where: { id: aid },
    include: {
      problems: { orderBy: { order: "asc" }, include: { problem: { select: { id: true, title: true, slug: true } } } },
      extensions: { where: { userId: session.id } },
    },
  });
  if (!assignment || assignment.sectionId !== sectionId || !assignment.published) notFound();

  const extension = assignment.extensions[0];
  const effectiveDue = extension?.newDueAt ?? assignment.dueAt;
  const now = Date.now();
  const msLeft = effectiveDue ? effectiveDue.getTime() - now : null;

  const problemStatuses = await Promise.all(
    assignment.problems.map(async (p) => {
      const best = await prisma.submission.findFirst({
        where: { userId: session.id, problemRefId: p.problemId },
        orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      });
      const attempts = await prisma.submission.count({ where: { userId: session.id, problemRefId: p.problemId } });
      return { problem: p, best, attempts };
    })
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href={`/courses/${sectionId}`} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
        ← Back
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold">{assignment.title}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {effectiveDue ? (
          msLeft != null && msLeft > 0 ? (
            <>Due in {formatDuration(msLeft)} ({effectiveDue.toLocaleString()})</>
          ) : (
            <>Was due {effectiveDue.toLocaleString()} — now overdue</>
          )
        ) : (
          "No due date"
        )}
      </p>
      {extension && (
        <p className="mt-1 text-xs text-[var(--accent)]">
          You have a personal extension to {extension.newDueAt.toLocaleString()}
          {extension.reason ? ` (${extension.reason})` : ""}.
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--muted)]">
        {(LATE_POLICY_COPY[assignment.latePolicy] ?? LATE_POLICY_COPY.NONE)(assignment.lateParam)}
      </p>

      <div className="mt-6 space-y-2">
        {problemStatuses.map(({ problem, best, attempts }) => {
          const solved = best ? best.score >= best.maxScore && best.maxScore > 0 : false;
          return (
            <Link
              key={problem.id}
              href={`/problems/${problem.problem.slug}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 hover:border-[var(--line-strong)]"
            >
              <div>
                <p className="text-sm font-semibold">{problem.problem.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {problem.points} pts{problem.required ? "" : " · optional"} · {attempts} attempt{attempts === 1 ? "" : "s"}
                </p>
              </div>
              <span
                className={`rounded border px-2 py-1 font-mono text-[10px] ${
                  solved
                    ? "border-[var(--accent-dim)] text-[var(--accent)]"
                    : best
                      ? "border-[var(--warn)]/30 text-[var(--warn)]"
                      : "border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {solved ? "SOLVED" : best ? `${best.score}/${best.maxScore}` : "NOT STARTED"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
