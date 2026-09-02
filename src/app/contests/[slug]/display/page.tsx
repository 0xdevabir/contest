export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { closeExpiredContests } from "@/lib/contest-lifecycle";
import { contestCapabilities } from "@/lib/contest-access";
import { getContestDashboard } from "@/lib/contest-dashboard";
import { isEnabled } from "@/lib/flags";
import { DisplayBoard } from "@/components/contest/DisplayBoard";

type Props = { params: Promise<{ slug: string }> };

/**
 * D4 (docs/phases/PHASE-07-live-contest.md) — projector-friendly public
 * display. `?rows=20&interval=15` auto-advances through the board;
 * `?resolver=1` switches to the post-contest bottom-up reveal. No
 * navigation, no auth prompt (SiteChrome bypasses its own chrome for this
 * route) — built for a laptop plugged into a projector at the back of a lab.
 */
export default async function ContestDisplayPage({ params }: Props) {
  const { slug } = await params;

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  await closeExpiredContests();
  const contest = await prisma.contest.findUnique({ where: { slug } });
  if (!contest) notFound();

  const caps = await contestCapabilities(session, contest);
  if (!caps.has("viewStandings")) notFound();

  const data = await getContestDashboard(contest.id, {
    viewerId: null,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    rules: contest.rules,
    createdAt: contest.createdAt,
  });

  const liveContestEnabled = await isEnabled("liveContest", { userId: session?.id, role: session?.role });

  return (
    <DisplayBoard
      contestId={contest.id}
      title={contest.title}
      data={data}
      liveEnabled={liveContestEnabled}
      canResolve={caps.has("viewAllSubmissions")}
    />
  );
}
