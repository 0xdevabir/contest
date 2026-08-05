export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestStatusLabel } from "@/lib/contests";
import { ContestRegisterButton } from "@/components/ContestRegisterButton";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Live C Programming Contests — DIU, NSU, AIUB, BRAC inter-university contests",
  description:
    "Join live inter-university programming contests. ICPC-style scoreboards with penalty per wrong submission, frozen standings, and live rankings between DIU, NSU, AIUB, and BRAC.",
  keywords: [
    "live programming contest",
    "inter-university programming contest",
    "ICPC style contest",
    "coding contest scoreboard",
    "DIU NSU AIUB BRAC contest",
    "university programming contest",
  ],
  alternates: { canonical: "/contests" },
  openGraph: {
    title: "Live C Programming Contests — Inter-university contests",
    description:
      "Join live ICPC-style programming contests between DIU, NSU, AIUB, and BRAC.",
    url: "/contests",
  },
  twitter: {
    title: "Live C Programming Contests",
    description:
      "Join live ICPC-style programming contests between DIU, NSU, AIUB, and BRAC.",
  },
};

export default async function ContestsPage() {
  let contests: Awaited<ReturnType<typeof loadContests>> = [];
  let dbError = false;
  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  try {
    contests = await loadContests();
  } catch {
    dbError = true;
  }

  const myRegs = new Set<string>();
  if (session && !dbError) {
    try {
      const regs = await prisma.contestRegistration.findMany({
        where: { userId: session.id },
        select: { contestId: true },
      });
      regs.forEach((r) => myRegs.add(r.contestId));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Compete"
        title="Contests"
        lead="Join contests while they are live. New contests appear here when an admin activates them."
      />

      {dbError && (
        <p className="mt-6 rounded-lg border border-[var(--warn)]/40 bg-[rgba(240,180,41,0.08)] p-3 text-sm text-[var(--warn)]">
          Database not connected. Configure Neon <code>DATABASE_URL</code> first.
        </p>
      )}

      <div className="mt-8 space-y-4">
        {!dbError && contests.length === 0 && (
          <div className="panel px-5 py-10 text-center">
            <h2 className="font-display text-lg font-semibold">No live contests</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Check back when an admin activates the next contest.
            </p>
          </div>
        )}
        {contests.map((c) => (
          <article key={c.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-[var(--accent)]">
                  {contestStatusLabel(c.status)}
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold">
                  <Link href={`/contests/${c.slug}`} className="hover:text-[var(--accent)]">
                    {c.title}
                  </Link>
                </h2>
                <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">
                  {c.description || "No description"}
                </p>
                <p className="mt-2 font-mono text-xs text-[var(--muted)]">
                  {c.durationMinutes} min · {c._count.problems} problems ·{" "}
                  {c._count.registrations} registered
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Link href={`/contests/${c.slug}`} className="btn btn-ghost !py-2 !text-xs">
                  View
                </Link>
                {c.status === "LIVE" && (
                  <ContestRegisterButton
                    contestId={c.id}
                    registered={myRegs.has(c.id)}
                    loggedIn={!!session}
                  />
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

async function loadContests() {
  const now = new Date();
  return prisma.contest.findMany({
    where: {
      status: "LIVE",
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: { startsAt: "desc" },
    include: {
      _count: { select: { problems: true, registrations: true } },
    },
  });
}


