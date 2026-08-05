import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  GaugeCircle,
  ListOrdered,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { getMeta, getSets } from "@/lib/problems";
import { SetGrid } from "@/components/SetGrid";
import { JudgePreview } from "@/components/home/JudgePreview";
import { UNIVERSITIES } from "@/lib/universities";
import { BRAND } from "@/lib/brand";

const FEATURES = [
  {
    icon: GaugeCircle,
    title: "Verdicts in milliseconds",
    body: "Every submission is compiled with gcc/clang and run against hidden tests with real time limits. You get AC, WA, TLE, RE, or the exact compiler error — never a vague pass/fail.",
  },
  {
    icon: ListOrdered,
    title: "A curriculum, not a pile",
    body: "20 sets of 7 questions, each set climbing Very Easy → Extreme. Work a set end to end and you have covered one full exam's worth of difficulty.",
  },
  {
    icon: CalendarClock,
    title: "Contests run by your faculty",
    body: "Admins schedule contests, pick the problem order, set the window and penalty rules, then flip them live. Standings update as submissions land.",
  },
  {
    icon: ShieldCheck,
    title: "Progress that survives",
    body: "Practice anonymously if you want. Sign in and every accepted solution, submission, and contest result is stored against your university profile.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Open a problem",
    body: "Statement, constraints, and samples sit beside the editor — no tab juggling.",
  },
  {
    n: "02",
    title: "Run your own input",
    body: "Test against custom stdin before it counts. Drafts autosave in your browser.",
  },
  {
    n: "03",
    title: "Submit for the verdict",
    body: "Hidden tests, per-test timing, and a diff of expected against what you printed.",
  },
];

export default function HomePage() {
  const meta = getMeta();
  const sets = getSets().map((s) => ({
    set: s.set,
    title: s.title,
    problems: s.problems.map((p) => ({ id: p.id, difficulty: p.difficulty })),
  }));

  const stats = [
    { value: meta.total, label: "C problems" },
    { value: meta.sets, label: "Graded sets" },
    { value: 7, label: "Difficulty tiers" },
    { value: UNIVERSITIES.length, label: "Universities" },
  ];

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden border-b border-[var(--line)]">
        <div
          aria-hidden
          className="grid-field pointer-events-none absolute inset-0"
          style={{
            maskImage:
              "radial-gradient(ellipse 90% 70% at 20% 0%, black 10%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 70% at 20% 0%, black 10%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[46rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(62,207,142,0.22), transparent 65%)" }}
        />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-12 lg:py-28">
          <div className="animate-fade-up min-w-0">
            <span className="badge badge-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {meta.subtitle}
            </span>

            <h1 className="font-display mt-6 max-w-[34rem] text-[2.35rem] font-extrabold leading-[1.06] tracking-tight sm:text-[3rem] lg:text-[3.4rem]">
              Practice C the way the{" "}
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">exam</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-[0.04em] z-0 h-[0.14em] bg-[var(--accent)] opacity-70"
                />
              </span>{" "}
              actually asks.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-[1.05rem]">
              {meta.total} original problems across {meta.sets} sets, each one climbing from
              Very Easy to Extreme. Write in the browser, run against your own input, and let
              the judge compile and grade it in milliseconds.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/sets/1" className="btn btn-primary">
                Start Set 01
                <ArrowRight size={16} />
              </Link>
              <Link href="/sets" className="btn btn-ghost">
                Browse all {meta.sets} sets
              </Link>
            </div>

            <p className="mt-4 font-mono text-[11px] text-[var(--muted-dim)]">
              No account required to practice · Sign in to save progress and enter contests
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--line-soft)] pt-6">
              <span className="eyebrow">Competing</span>
              {UNIVERSITIES.map((u) => (
                <span
                  key={u.code}
                  title={u.name}
                  className="font-display text-sm font-bold tracking-wide text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                >
                  {u.shortName}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-fade-up min-w-0 lg:pl-4" style={{ animationDelay: "120ms" }}>
            <JudgePreview />
          </div>
        </div>
      </section>

      {/* ---------------- stats ---------------- */}
      <section className="border-b border-[var(--line)] bg-black/20">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-[var(--line-soft)] px-4 sm:px-6 lg:grid-cols-4 lg:divide-y-0">
          {stats.map((s) => (
            <div key={s.label} className="px-2 py-7 first:pl-0 sm:px-6 lg:py-9">
              <dt className="eyebrow">{s.label}</dt>
              <dd className="font-display tnum mt-2 text-3xl font-extrabold sm:text-4xl">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- features ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <p className="eyebrow">Why it holds up</p>
          <h2 className="font-display mt-3 text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
            Built like a real judge, not a quiz app.
          </h2>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group bg-[var(--bg)] p-7 transition-colors hover:bg-[var(--bg-elevated)] lg:p-9"
            >
              <Icon
                size={20}
                strokeWidth={1.6}
                className="text-[var(--muted-dim)] transition-colors group-hover:text-[var(--accent)]"
              />
              <h3 className="font-display mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- workflow ---------------- */}
      <section className="border-y border-[var(--line)] bg-black/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[340px_1fr] lg:gap-16">
            <div>
              <p className="eyebrow">The loop</p>
              <h2 className="font-display mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
                Three keystrokes from idea to verdict.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[11px]">
                  ⌘/Ctrl
                </kbd>{" "}
                +{" "}
                <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[11px]">
                  Enter
                </kbd>{" "}
                submits without leaving the editor.
              </p>
            </div>
            <ol className="grid gap-px bg-[var(--line-soft)] sm:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="bg-[var(--bg)] p-6">
                  <span className="font-mono text-xs text-[var(--accent)]">{s.n}</span>
                  <h3 className="font-display mt-3 text-base font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------- sets ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <SetGrid sets={sets} />
      </section>

      {/* ---------------- contests ---------------- */}
      <section className="border-y border-[var(--line)] bg-black/20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div>
            <p className="eyebrow">Contests</p>
            <h2 className="font-display mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">
              Four campuses, one scoreboard.
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
              {BRAND.name} contests are configured end to end by administrators: problem
              order, start and end time, penalty per wrong submission, and who is allowed to
              register. When a contest goes live, standings rank by problems solved, then by
              penalty — the same rules you will meet at the take-off contest.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contests" className="btn btn-primary">
                <Trophy size={16} />
                See contests
              </Link>
              <Link href="/leaderboard" className="btn btn-ghost">
                University leaderboards
              </Link>
            </div>
          </div>

          <ul className="panel divide-y divide-[var(--line-soft)] overflow-hidden">
            {UNIVERSITIES.map((u) => (
              <li key={u.code}>
                <Link
                  href={`/leaderboard?university=${u.code}`}
                  className="flex items-center justify-between gap-4 px-6 py-5 transition-colors hover:bg-white/[0.025]"
                >
                  <div className="min-w-0">
                    <p className="font-display text-base font-bold">{u.shortName}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{u.name}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-[var(--muted-dim)]">
                    Standings
                    <ArrowRight size={14} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- cta ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="panel relative overflow-hidden px-6 py-14 text-center sm:px-16">
          <div
            aria-hidden
            className="grid-field pointer-events-none absolute inset-0 opacity-60"
            style={{
              maskImage: "radial-gradient(ellipse at center, black, transparent 72%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black, transparent 72%)",
            }}
          />
          <div className="relative">
            <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold leading-tight sm:text-[2.75rem]">
              The next contest is graded the same way this page is.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
              Create an account with your university, keep every accepted solution, and show
              up on the board.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/register" className="btn btn-primary">
                Create your account
                <ArrowRight size={16} />
              </Link>
              <Link href="/sets/1" className="btn btn-ghost">
                Solve one first
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
