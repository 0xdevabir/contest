export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { University } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getContestLeaderboard } from "@/lib/leaderboard";
import { contestStatusLabel, parseRules } from "@/lib/contests";
import { getProblem } from "@/lib/problems";
import { UNIVERSITIES, universityLabel } from "@/lib/universities";
import { ContestRegisterButton } from "@/components/ContestRegisterButton";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ uni?: string }>;
};

export default async function ContestDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { uni } = await searchParams;

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  let contest;
  try {
    contest = await prisma.contest.findUnique({
      where: { slug },
      include: {
        problems: { orderBy: { order: "asc" } },
        _count: { select: { registrations: true } },
      },
    });
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-[var(--warn)]">
        Database not connected.
      </div>
    );
  }

  if (!contest || contest.status === "DRAFT") notFound();

  const university = UNIVERSITIES.some((u) => u.code === uni)
    ? (uni as University)
    : undefined;

  const rules = parseRules(contest.rules);
  let freezeAt: Date | null = null;
  if (contest.status === "LIVE" && contest.endsAt && rules.freezeMinutes > 0) {
    freezeAt = new Date(contest.endsAt.getTime() - rules.freezeMinutes * 60_000);
    if (Date.now() < freezeAt.getTime()) freezeAt = null; // not frozen yet
  }

  const standings = await getContestLeaderboard(contest.id, {
    university,
    freezeAt: freezeAt && Date.now() >= freezeAt.getTime() ? freezeAt : null,
  });

  let registered = false;
  if (session) {
    const reg = await prisma.contestRegistration.findUnique({
      where: { contestId_userId: { contestId: contest.id, userId: session.id } },
    });
    registered = !!reg;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm text-[var(--muted)]">
        <Link href="/contests" className="hover:text-[var(--text)]">
          Contests
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--text)]">{contest.title}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-[var(--accent)]">
            {contestStatusLabel(contest.status)}
          </p>
          <h1 className="mt-1 font-display text-3xl font-700">{contest.title}</h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)] whitespace-pre-wrap">
            {contest.description || "No description."}
          </p>
          <dl className="mt-4 grid gap-2 font-mono text-xs text-[var(--muted)] sm:grid-cols-2">
            <div>Duration: {contest.durationMinutes} minutes</div>
            <div>Registrations: {contest._count.registrations}</div>
            <div>
              Starts:{" "}
              {contest.startsAt ? contest.startsAt.toLocaleString() : "—"}
            </div>
            <div>
              Ends: {contest.endsAt ? contest.endsAt.toLocaleString() : "—"}
            </div>
            <div>Penalty / wrong: {rules.penaltyPerWrong} min</div>
            <div>Scoreboard freeze: {rules.freezeMinutes} min</div>
          </dl>
          {rules.notes && (
            <p className="mt-3 rounded-lg border border-[var(--line)] bg-black/20 p-3 text-sm text-[var(--muted)]">
              {rules.notes}
            </p>
          )}
        </div>
        {(contest.status === "SCHEDULED" || contest.status === "LIVE") && (
          <ContestRegisterButton
            contestId={contest.id}
            registered={registered}
            loggedIn={!!session}
          />
        )}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-600">Problems</h2>
        <ul className="panel mt-3 divide-y divide-[var(--line)] overflow-hidden">
          {contest.problems.map((p) => {
            const meta = getProblem(p.problemId);
            return (
              <li key={p.id}>
                <Link
                  href={
                    contest.status === "LIVE" && registered
                      ? `/problems/${p.problemId}?contest=${contest.id}`
                      : contest.status === "ENDED"
                        ? `/problems/${p.problemId}`
                        : `/contests/${contest.slug}`
                  }
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
                >
                  <span>
                    <span className="font-mono text-[var(--accent)]">{p.label}</span>
                    <span className="ml-3">{meta?.title || p.problemId}</span>
                  </span>
                  <span className="font-mono text-xs text-[var(--muted)]">{p.points} pts</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {contest.status === "LIVE" && !registered && (
          <p className="mt-2 text-xs text-[var(--warn)]">
            Register to open contest problems.
          </p>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-xl font-600">Leaderboard</h2>
          <div className="flex flex-wrap gap-2">
            <UniChip href={`/contests/${slug}`} active={!university} label="All" />
            {UNIVERSITIES.map((u) => (
              <UniChip
                key={u.code}
                href={`/contests/${slug}?uni=${u.code}`}
                active={university === u.code}
                label={u.shortName}
              />
            ))}
          </div>
        </div>
        {freezeAt && Date.now() >= freezeAt.getTime() && contest.status === "LIVE" && (
          <p className="mt-2 text-xs text-[var(--warn)]">
            Scoreboard frozen (last {rules.freezeMinutes} minutes).
          </p>
        )}
        <div className="panel mt-3 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">University</th>
                <th className="px-4 py-3 text-right">Solved</th>
                <th className="px-4 py-3 text-right">Penalty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {standings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                    No registrations / solves yet.
                  </td>
                </tr>
              )}
              {standings.map((r) => (
                <tr key={r.userId}>
                  <td className="px-4 py-3 font-mono text-[var(--accent)]">{r.rank}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {universityLabel(r.university)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.solved}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.penalty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UniChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
        active
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--line)] text-[var(--muted)]"
      }`}
    >
      {label}
    </Link>
  );
}
