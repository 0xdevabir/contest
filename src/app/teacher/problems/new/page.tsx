import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewProblemForm } from "@/components/problem/NewProblemForm";

export default function NewTeacherProblemPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/teacher/problems" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden /> Your problems
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold">Create problem</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Start with the basics — you can add tests, reference solutions, and refine the statement next.
      </p>
      <NewProblemForm />
    </div>
  );
}
