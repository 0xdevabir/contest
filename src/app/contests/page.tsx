export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  contestStatusLabel,
  effectiveContestStatus,
  isContestOpen,
  isContestPublic,
} from "@/lib/contests";
import { closeExpiredContests } from "@/lib/contest-lifecycle";
import { ContestRegisterButton } from "@/components/ContestRegisterButton";
import { PageHeader } from "@/components/PageHeader";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "C Programming Contests — Live Events & Published Archives",
  description:
    "Join live inter-university C programming contests and browse published past contests with final standings across DIU, NSU, AIUB, and BRAC University.",
  path: "/contests",
  keywords: [
    "live programming contest",
    "inter-university programming contest",
    "ICPC style contest",
    "coding contest scoreboard",
    "DIU NSU AIUB BRAC contest",
    "university programming contest Bangladesh",
  ],
});

export default async function ContestsPage() {
  let contests: Awaited<ReturnType<typeof loadContests>> = [];
  let dbError = false;
  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  const myRegs = new Set<string>();
  if (session) {
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

  try {
    contests = await loadContests(myRegs);
  } catch {
    dbError = true;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contests", path: "/contests" },
        ])}
      />
      <PageHeader
        eyebrow="Compete"
        title="C programming contests"
        lead="Join active contests or review past contests an admin has chosen to publish, including their final standings and problem lists."
      />

      {dbError && (
        <p className="mt-6 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn-surface)] p-3 text-sm text-[var(--warn)]">
          Database not connected. Configure Neon <code>DATABASE_URL</code> first.
        </p>
      )}

      <div className="mt-8 space-y-4">
        {!dbError && contests.length === 0 && (
          <div className="panel px-5 py-10 text-center">
            <h2 className="font-display text-lg font-semibold">No published contests</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Check back when an admin activates or publishes a contest.
            </p>
          </div>
        )}
        {contests.map((c) => {
          const status = effectiveContestStatus(c.status, c.endsAt);
          const open = isContestOpen(c.status, c.startsAt, c.endsAt);
          return (
          <article key={c.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p
                  className={`font-mono text-xs ${
                    open ? "text-[var(--accent)]" : "text-[var(--muted)]"
                  }`}
                >
                  {contestStatusLabel(status)}
                  {myRegs.has(c.id) && " · You joined"}
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
                  {open ? "View" : "Final standings"}
                </Link>
                {open && (
                  <ContestRegisterButton
                    contestId={c.id}
                    registered={myRegs.has(c.id)}
                    loggedIn={!!session}
                  />
                )}
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </div>
  );
}

async function loadContests(myRegs: Set<string>) {
  await closeExpiredContests();
  const contests = await prisma.contest.findMany({
    where: {
      status: { in: ["LIVE", "ENDED"] },
    },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    include: {
      _count: { select: { problems: true, registrations: true } },
    },
  });
  // People who joined a contest keep access to it even when the admin has not
  // published the archive, so their results never vanish on them.
  return contests.filter(
    (contest) =>
      myRegs.has(contest.id) ||
      isContestPublic(contest.status, contest.startsAt, contest.endsAt, contest.rules)
  );
}

