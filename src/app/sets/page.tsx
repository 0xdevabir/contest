import { getMeta, getSets } from "@/lib/problems";
import { SetsIndexClient } from "@/components/SetsIndexClient";

export const metadata = { title: "All sets" };

export default function SetsPage() {
  const sets = getSets();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Problem bank</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        All {meta.sets} sets
      </h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
        {meta.total} exam-style problems in {meta.sets} sets of {meta.problemsPerSet}. Open
        any problem directly — practice needs no account.
      </p>
      <hr className="rule mt-10" />
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
