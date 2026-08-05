import Link from "next/link";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import { DIFFICULTY_ORDER, difficultyClass } from "@/lib/difficulty";
import { getBank, getMeta, getSets } from "@/lib/problems";
import type { Difficulty } from "@/lib/types";

type Props = {
  searchParams: Promise<{
    q?: string;
    difficulty?: string;
    set?: string;
    source?: string;
    page?: string;
  }>;
};

const pageSize = 40;

export default async function AdminProblemsPage({ searchParams }: Props) {
  const params = await searchParams;
  const meta = getMeta();
  const bank = getBank();
  const sets = getSets();
  const q = params.q?.trim().toLowerCase() ?? "";
  const difficulty = DIFFICULTY_ORDER.includes(params.difficulty as Difficulty)
    ? (params.difficulty as Difficulty)
    : undefined;
  const setNum = params.set ? Number(params.set) : undefined;
  const source =
    params.source === "authored" || params.source === "generated" ? params.source : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const all = Object.values(bank.problems).sort((a, b) => {
    if (a.set !== b.set) return a.set - b.set;
    return a.question - b.question;
  });

  const filtered = all.filter((problem) => {
    if (difficulty && problem.difficulty !== difficulty) return false;
    if (setNum && problem.set !== setNum) return false;
    if (source && (problem.source ?? "authored") !== source) return false;
    if (!q) return true;
    return (
      problem.id.toLowerCase().includes(q) ||
      problem.title.toLowerCase().includes(q) ||
      (problem.topic ?? "").toLowerCase().includes(q) ||
      problem.setTitle.toLowerCase().includes(q)
    );
  });

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const byDifficulty = DIFFICULTY_ORDER.map((tier) => ({
    tier,
    count: all.filter((p) => p.difficulty === tier).length,
  }));

  const queryBase = new URLSearchParams();
  if (params.q) queryBase.set("q", params.q);
  if (difficulty) queryBase.set("difficulty", difficulty);
  if (setNum) queryBase.set("set", String(setNum));
  if (source) queryBase.set("source", source);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Problem bank
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Problems</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Browse all {meta.total} problems across {meta.sets} sets. Open any problem to preview or
          assign it inside a contest.
        </p>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total problems" value={meta.total} />
        <Metric label="Curriculum sets" value={meta.sets} />
        <Metric
          label="Authored"
          value={all.filter((p) => (p.source ?? "authored") === "authored").length}
        />
        <Metric
          label="Generated extras"
          value={all.filter((p) => p.source === "generated").length}
        />
      </section>

      <section className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {byDifficulty.map(({ tier, count }) => (
          <Link
            key={tier}
            href={`/admin/problems?difficulty=${encodeURIComponent(tier)}`}
            className={`rounded-xl border p-3 transition-colors ${
              difficulty === tier
                ? "border-[var(--accent-dim)] bg-[rgba(62,207,142,0.07)]"
                : "border-[var(--line)] bg-[var(--bg-panel)] hover:border-[var(--line-strong)]"
            }`}
          >
            <p className={`font-mono text-[10px] uppercase ${difficultyClass(tier)}`}>{tier}</p>
            <p className="mt-1 font-display text-xl font-bold">{count}</p>
          </Link>
        ))}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <form className="grid gap-2 border-b border-[var(--line)] p-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,auto)_auto]">
          <label className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden
            />
            <span className="sr-only">Search problems</span>
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Search id, title, topic…"
              className="field !py-2 !pl-9 !text-xs"
            />
          </label>
          <select name="difficulty" defaultValue={difficulty ?? ""} className="field !py-2 !text-xs">
            <option value="">All difficulties</option>
            {DIFFICULTY_ORDER.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
          <select name="set" defaultValue={setNum ? String(setNum) : ""} className="field !py-2 !text-xs">
            <option value="">All sets</option>
            {sets.map((s) => (
              <option key={s.set} value={s.set}>
                Set {String(s.set).padStart(2, "0")} · {s.title}
              </option>
            ))}
          </select>
          <select name="source" defaultValue={source ?? ""} className="field !py-2 !text-xs">
            <option value="">All sources</option>
            <option value="authored">Authored</option>
            <option value="generated">Generated</option>
          </select>
          <button type="submit" className="btn btn-ghost !py-2 !text-xs">
            Apply
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Problem</th>
                <th className="px-4 py-3 font-medium">Set</th>
                <th className="px-4 py-3 font-medium">Difficulty</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Tests</th>
                <th className="px-4 py-3 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--muted)]">
                    No problems match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((problem) => (
                  <tr key={problem.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3.5">
                      <p className="font-medium">{problem.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                        {problem.id}
                        {problem.topic ? ` · ${problem.topic}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-[var(--muted)]">
                      Set {problem.set} · Q{problem.question}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`font-mono text-[10px] uppercase ${difficultyClass(problem.difficulty)}`}
                      >
                        {problem.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[var(--muted)]">
                      {problem.source === "generated" ? "Generated" : "Authored"}
                    </td>
                    <td className="tnum px-4 py-3.5 font-mono text-[var(--muted)]">
                      {problem.openEnded ? "—" : problem.tests.length}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/problems/${problem.id}`}
                        className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview <ExternalLink size={12} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          <span>
            Showing {rows.length} of {filtered.length} · page {page}/{pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/problems?${keepQuery(queryBase, page - 1)}`}
                className="btn btn-ghost !py-1.5 !text-xs"
              >
                Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={`/admin/problems?${keepQuery(queryBase, page + 1)}`}
                className="btn btn-ghost !py-1.5 !text-xs"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </section>

      <p className="mt-4 flex items-center gap-2 text-xs text-[var(--muted-dim)]">
        <BookOpen size={13} aria-hidden />
        Problems are loaded from <code>data/problems.json</code>. Assign them when creating or
        editing a contest.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold">{value.toLocaleString()}</p>
    </article>
  );
}

function keepQuery(base: URLSearchParams, page: number) {
  const next = new URLSearchParams(base);
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  return next.toString();
}
