import Link from "next/link";
import { getMeta, getSets } from "@/lib/problems";
import { SetsIndexClient } from "@/components/SetsIndexClient";
import { PageHeader } from "@/components/PageHeader";

export const metadata = { title: "All sets" };

export default function SetsPage() {
  const sets = getSets();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Problem bank"
        title={`All ${meta.sets} sets`}
        lead={
          <>
            {meta.sets} curriculum sets × {meta.problemsPerSet} questions (
            {meta.sets * meta.problemsPerSet} core problems). Browse all {meta.total} by
            difficulty on{" "}
            <Link
              href="/problems"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              All problems
            </Link>
            .
          </>
        }
      />
      <SetsIndexClient
        sets={sets.map((s) => ({
          set: s.set,
          title: s.title,
          problems: s.problems,
        }))}
      />
    </div>
  );
}
