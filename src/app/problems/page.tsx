import { SetsIndexClient } from "@/components/SetsIndexClient";
import { getMeta, getSets } from "@/lib/problems";

export const metadata = {
  title: "Problems",
  description: "Practice all 140 C programming problems at any time.",
};

export default function ProblemsPage() {
  const sets = getSets();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Always-open practice</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        All {meta.total} problems
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--muted)]">
        Solve any question whenever you want. Practice problems are separate from live
        contests, need no registration, and remain available after contests end.
      </p>
      <hr className="rule mt-10" />
      <SetsIndexClient
        sets={sets.map((set) => ({
          set: set.set,
          title: set.title,
          problems: set.problems,
        }))}
      />
    </div>
  );
}
