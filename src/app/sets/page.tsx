import { getSets } from "@/lib/problems";
import { SetsIndexClient } from "@/components/SetsIndexClient";

export default function SetsPage() {
  const sets = getSets();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-700">All sets</h1>
      <p className="mt-2 text-[var(--muted)]">
        20 exam-style sets · pick any problem · no login required
      </p>
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
