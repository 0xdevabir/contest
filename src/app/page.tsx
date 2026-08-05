import Link from "next/link";
import { getMeta, getSets } from "@/lib/problems";

export default function HomePage() {
  const meta = getMeta();
  const sets = getSets();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <section className="animate-fade-up relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] px-6 py-14 sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(62,207,142,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(62,207,142,0.07) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)",
          }}
        />
        <p className="relative mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
          {meta.language} practice · exam sprint
        </p>
        <h1 className="relative font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
          Contest
          <span className="text-[var(--accent)]">Hub</span>
        </h1>
        <p className="relative mt-5 max-w-xl text-base text-[var(--muted)] sm:text-lg">
          {meta.total} original C problems across {meta.sets} sets. Open a problem,
          write code, hit Submit — no account, no setup.
        </p>
        <div className="relative mt-8 flex flex-wrap gap-3">
          <Link href="/sets/1" className="btn btn-primary">
            Practice Set 1
          </Link>
          <Link href="/sets" className="btn btn-ghost">
            Browse all sets
          </Link>
        </div>
      </section>

      <section className="mt-14 animate-fade-up" style={{ animationDelay: "80ms" }}>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-700">Problem sets</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Each set ramps Very Easy → Extreme (Q1–Q7).
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((s) => (
            <Link
              key={s.set}
              href={`/sets/${s.set}`}
              className="panel group block p-4 transition-colors hover:border-[var(--accent-dim)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[var(--accent)]">
                  SET {String(s.set).padStart(2, "0")}
                </span>
                <span className="text-xs text-[var(--muted)]">7 problems</span>
              </div>
              <h3 className="mt-2 font-display text-lg font-600 leading-snug group-hover:text-[var(--accent)]">
                {s.title}
              </h3>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
