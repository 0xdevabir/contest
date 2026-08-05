import Link from "next/link";
import { notFound } from "next/navigation";
import { getSets } from "@/lib/problems";
import { difficultyClass } from "@/lib/difficulty";

type Props = { params: Promise<{ set: string }> };

export function generateStaticParams() {
  return Array.from({ length: 20 }, (_, i) => ({ set: String(i + 1) }));
}

export default async function SetDetailPage({ params }: Props) {
  const { set: setParam } = await params;
  const setNum = Number(setParam);
  const set = getSets().find((s) => s.set === setNum);
  if (!set) notFound();

  const prev = setNum > 1 ? setNum - 1 : null;
  const next = setNum < 20 ? setNum + 1 : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
        <Link href="/sets" className="hover:text-[var(--text)]">
          Sets
        </Link>
        <span>/</span>
        <span className="text-[var(--text)]">Set {set.set}</span>
      </div>

      <p className="font-mono text-xs text-[var(--accent)]">
        SET {String(set.set).padStart(2, "0")}
      </p>
      <h1 className="mt-1 font-display text-3xl font-700 sm:text-4xl">{set.title}</h1>
      <p className="mt-2 text-[var(--muted)]">
        Seven problems, difficulty ramps from Very Easy to Extreme.
      </p>

      <ul className="panel mt-8 divide-y divide-[var(--line)] overflow-hidden">
        {set.problems.map((p) => (
          <li key={p.id}>
            <Link
              href={`/problems/${p.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
            >
              <div>
                <div className="font-mono text-xs text-[var(--muted)]">Q{p.question}</div>
                <div className="mt-0.5 text-lg font-medium">{p.title}</div>
              </div>
              <span
                className={`font-mono text-[11px] uppercase tracking-wide ${difficultyClass(p.difficulty)}`}
              >
                {p.difficulty}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex justify-between">
        {prev ? (
          <Link href={`/sets/${prev}`} className="btn btn-ghost">
            ← Set {prev}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/sets/${next}`} className="btn btn-ghost">
            Set {next} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
