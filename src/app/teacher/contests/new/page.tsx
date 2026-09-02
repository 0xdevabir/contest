import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContestEditor } from "@/components/contest/ContestEditor";
import { getProblemOptions } from "@/lib/problems";

export default async function NewTeacherContestPage() {
  const problems = await getProblemOptions();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8">
      <Link
        href="/teacher/contests"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Your contests
      </Link>
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Contest builder
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Create contest</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure the schedule, scoring model, access, and problem order. New
          contests default to private until you&rsquo;re ready to publish.
        </p>
      </header>
      <div className="mt-7">
        <ContestEditor problems={problems} apiBase="/api/teacher/contests" />
      </div>
    </div>
  );
}
