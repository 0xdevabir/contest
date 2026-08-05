import Link from "next/link";
import { getSets } from "@/lib/problems";
import { difficultyClass } from "@/lib/difficulty";

export default function SetsPage() {
  const sets = getSets();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-700">All sets</h1>
      <p className="mt-2 text-[var(--muted)]">
        20 exam-style sets · pick any problem · no login required
      </p>

      <div className="mt-8 space-y-6">
        {sets.map((s) => (
          <section key={s.set} className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="font-mono text-xs text-[var(--accent)]">
                  SET {String(s.set).padStart(2, "0")}
                </p>
                <h2 className="font-display text-xl font-600">{s.title}</h2>
              </div>
              <Link href={`/sets/${s.set}`} className="btn btn-ghost !py-2 !text-xs">
                Open set
              </Link>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {s.problems.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/problems/${p.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-[var(--muted)]">
                        Q{p.question}
                      </span>
                      <span className="ml-3 font-medium">{p.title}</span>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[11px] uppercase tracking-wide ${difficultyClass(p.difficulty)}`}
                    >
                      {p.difficulty}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
