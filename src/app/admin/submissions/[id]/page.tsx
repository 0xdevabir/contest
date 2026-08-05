import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, ExternalLink, User } from "lucide-react";
import { prisma } from "@/lib/db";
import { getProblem } from "@/lib/problems";

type Props = { params: Promise<{ id: string }> };

export default async function SubmissionDetailPage({ params }: Props) {
  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          university: true,
          studentId: true,
        },
      },
      contest: { select: { id: true, title: true, slug: true } },
    },
  });
  if (!submission) notFound();
  const problem = getProblem(submission.problemId);

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-7 sm:px-6 lg:px-8">
      <Link
        href="/admin/submissions"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} />
        All submissions
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Verdict verdict={submission.verdict} />
            <span className="font-mono text-[10px] text-[var(--muted)]">
              {submission.id}
            </span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold">
            {problem?.title ?? submission.problemId}
          </h1>
          <p className="mt-1 font-mono text-xs text-[var(--muted)]">
            {submission.problemId} · {submission.language.toUpperCase()}
          </p>
        </div>
        <Link
          href={`/problems/${submission.problemId}`}
          target="_blank"
          className="btn btn-ghost !py-2 !text-xs"
        >
          <ExternalLink size={13} />
          Open problem
        </Link>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Participant" icon={User}>
          {submission.user?.name ?? "Guest"}
        </Info>
        <Info label="University" icon={User}>
          {submission.user?.university ?? "—"}
        </Info>
        <Info label="Runtime" icon={Clock3}>
          {submission.timeMs != null ? `${submission.timeMs}ms` : "—"}
        </Info>
        <Info label="Submitted" icon={Clock3}>
          {submission.createdAt.toLocaleString()}
        </Info>
      </section>

      {submission.contest && (
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-4 py-3 text-xs">
          Contest:{" "}
          <Link
            href={`/admin/contests/${submission.contest.id}`}
            className="text-[var(--accent)]"
          >
            {submission.contest.title}
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[#080c12]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="font-display text-sm font-bold">Source code</h2>
            <span className="font-mono text-[10px] text-[var(--muted)]">main.c</span>
          </div>
          <pre className="max-h-[650px] overflow-auto p-4 font-mono text-xs leading-6 text-[#d8e2ee]">
            <code>{submission.code}</code>
          </pre>
        </section>

        <div className="space-y-5">
          <OutputPanel title="Standard output" value={submission.stdout} />
          <OutputPanel
            title="Compiler / runtime errors"
            value={submission.stderr}
            error
          />
          <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
            <h2 className="font-display text-sm font-bold">Participant details</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="Name" value={submission.user?.name ?? "Guest"} />
              <Row label="Email" value={submission.user?.email ?? "—"} />
              <Row label="University" value={submission.user?.university ?? "—"} />
              <Row label="Student ID" value={submission.user?.studentId ?? "—"} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Verdict({ verdict }: { verdict: string }) {
  return (
    <span
      className={`rounded border px-2 py-1 font-mono text-[10px] font-semibold ${
        verdict === "AC"
          ? "border-[var(--accent-dim)] text-[var(--accent)]"
          : verdict === "WA"
            ? "border-[var(--danger)]/30 text-[var(--danger)]"
            : "border-[var(--warn)]/30 text-[var(--warn)]"
      }`}
    >
      {verdict}
    </span>
  );
}

function Info({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        {label}
        <Icon size={14} />
      </div>
      <p className="mt-2 truncate text-sm font-medium">{children}</p>
    </div>
  );
}

function OutputPanel({
  title,
  value,
  error = false,
}: {
  title: string;
  value: string | null;
  error?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
      <h2 className="border-b border-[var(--line)] px-4 py-3 font-display text-sm font-bold">
        {title}
      </h2>
      <pre
        className={`max-h-56 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-5 ${
          error ? "text-[var(--danger)]" : "text-[var(--muted)]"
        }`}
      >
        {value || "(empty)"}
      </pre>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="max-w-52 truncate text-right">{value}</dd>
    </div>
  );
}
