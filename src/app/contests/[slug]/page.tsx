export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  effectiveContestStatus,
  isContestPublic,
  parseRules,
} from "@/lib/contests";
import { closeExpiredContests } from "@/lib/contest-lifecycle";
import { contestCapabilities } from "@/lib/contest-access";
import { getContestDashboard } from "@/lib/contest-dashboard";
import { isEnabled } from "@/lib/flags";
import { ContestDashboard } from "@/components/contest/ContestDashboard";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ uni?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let contest;
  try {
    contest = await prisma.contest.findUnique({
      where: { slug },
      select: {
        title: true,
        description: true,
        status: true,
        startsAt: true,
        endsAt: true,
        rules: true,
        durationMinutes: true,
        _count: { select: { problems: true, registrations: true } },
      },
    });
  } catch {
    return {
      title: "Contest",
      robots: { index: false, follow: false },
    };
  }
  if (
    !contest ||
    !isContestPublic(contest.status, contest.startsAt, contest.endsAt, contest.rules)
  ) {
    return {
      title: "Contest not found",
      robots: { index: false, follow: false },
    };
  }
  const archived = effectiveContestStatus(contest.status, contest.endsAt) === "ENDED";
  const description =
    (contest.description?.trim() ||
      `${archived ? "Archived" : "Live"} C programming contest: ${contest.durationMinutes} minutes, ${contest._count.problems} problems, ${contest._count.registrations} registered.`) +
    ` ICPC-style standings with penalty per wrong submission on CodeHub.`;
  return buildPageMetadata({
    title: `${contest.title} — ${archived ? "Past contest & final standings" : "Live C programming contest"}`,
    description,
    path: `/contests/${slug}`,
    type: "article",
    keywords: [
      contest.title,
      archived ? "past programming contest" : "live programming contest",
      "coding contest leaderboard",
      "inter-university contest Bangladesh",
      "ICPC style contest",
    ],
  });
}

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
    await closeExpiredContests();
    contest = await prisma.contest.findUnique({ where: { slug } });
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-[var(--warn)]">
        Database not connected.
      </div>
    );
  }

  let registered = false;
  if (session && contest) {
    const reg = await prisma.contestRegistration.findUnique({
      where: { contestId_userId: { contestId: contest.id, userId: session.id } },
    });
    registered = !!reg;
  }

  const rules = contest ? parseRules(contest.rules) : null;
  if (!contest || !rules) notFound();

  // The real access gate: visibility × join policy × staff role, not just
  // "is this contest published" — a PRIVATE contest must be unreachable by
  // slug to a stranger even while LIVE (docs/phases/PHASE-05-contest-engine.md
  // D2 / acceptance criterion 3).
  const caps = await contestCapabilities(
    session,
    contest,
    registered ? { mode: "LIVE", official: true } : null
  );
  const effective = effectiveContestStatus(contest.status, contest.endsAt);
  // A finished contest additionally needs `publishAfterEnd` for a
  // non-participant, non-staff visitor — a separate axis from visibility
  // (whether the archive is public), not a substitute for it.
  const archiveOpen = effective !== "ENDED" || rules.publishAfterEnd || registered || caps.has("viewAllSubmissions");
  if (!caps.has("view") || !archiveOpen) {
    notFound();
  }

  const data = await getContestDashboard(contest.id, {
    viewerId: session?.id ?? null,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    rules: contest.rules,
    createdAt: contest.createdAt,
  });

  const liveContestEnabled = await isEnabled("liveContest", { userId: session?.id, role: session?.role });

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contests", path: "/contests" },
          { name: contest.title, path: `/contests/${slug}` },
        ])}
      />
      <nav
        aria-label="Breadcrumb"
        className="mx-auto max-w-[1400px] px-3 pt-6 text-sm text-[var(--muted)] sm:px-6"
      >
        <ol className="flex flex-wrap items-center">
          <li>
            <Link href="/contests" className="hover:text-[var(--text)]">
              Contests
            </Link>
          </li>
          <li aria-hidden className="mx-2">
            /
          </li>
          <li className="truncate text-[var(--text)]" aria-current="page">
            {contest.title}
          </li>
        </ol>
      </nav>
      <ContestDashboard
        contestId={contest.id}
        title={contest.title}
        description={contest.description}
        durationMinutes={contest.durationMinutes}
        data={data}
        rules={{
          penaltyPerWrong: rules.penaltyPerWrong,
          freezeMinutes: rules.freezeMinutes,
          maxSubmissionsPerProblem: rules.maxSubmissionsPerProblem,
          languages: rules.languages,
          notes: rules.notes ?? "",
        }}
        registered={registered}
        loggedIn={!!session}
        viewerId={session?.id ?? null}
        initialUni={uni ?? null}
        liveContestEnabled={liveContestEnabled}
        isStaff={caps.has("viewAllSubmissions")}
        teamSize={rules.teamSize}
      />
    </>
  );
}

