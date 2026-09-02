export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { BalloonQueue } from "@/components/contest/BalloonQueue";

type Props = { params: Promise<{ slug: string }> };

/** D — runner-facing balloon queue (docs/phases/PHASE-07-live-contest.md). Staff only. */
export default async function ContestBalloonsPage({ params }: Props) {
  const { slug } = await params;

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  const contest = await prisma.contest.findUnique({ where: { slug } });
  if (!contest) notFound();

  const caps = await contestCapabilities(session, contest);
  if (!caps.has("viewAllSubmissions")) notFound();

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-6 sm:py-8">
      <h1 className="font-display text-2xl font-bold">Balloon queue — {contest.title}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Ordered oldest first. Tap Delivered once the balloon is handed over.</p>
      <div className="mt-6">
        <BalloonQueue contestId={contest.id} />
      </div>
    </div>
  );
}
