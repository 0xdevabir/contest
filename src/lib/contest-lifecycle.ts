import { prisma } from "./db";

/**
 * Move contests out of LIVE once their window has passed.
 *
 * Nothing else does this — the admin "End" button is the only writer of ENDED —
 * so without it an expired contest stays LIVE forever and disappears from both
 * the live list and the archive. Public contest reads call this first so the
 * stored status matches reality for standings, admin views, and submissions.
 */
export async function closeExpiredContests(): Promise<number> {
  try {
    const { count } = await prisma.contest.updateMany({
      where: { status: "LIVE", endsAt: { lt: new Date() } },
      data: { status: "ENDED" },
    });
    return count;
  } catch (err) {
    console.error("closing expired contests failed", err);
    return 0;
  }
}
