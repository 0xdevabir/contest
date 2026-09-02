export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isApprovedTeacher } from "@/lib/authz";
import { CoachSquads } from "@/components/contest/CoachSquads";

/** D — coach/squad view (docs/phases/PHASE-07-live-contest.md): persistent
 * squads plus, per squad, the contests its current members have competed in. */
export default async function CoachPage() {
  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (!session) redirect("/login");
  if (!isApprovedTeacher(session) && session.role !== "ADMIN") redirect("/");

  return (
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-6 sm:py-8">
      <h1 className="font-display text-2xl font-bold">Your squads</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Persistent rosters you coach across seasons, with each member&apos;s recent contest-team history.
      </p>
      <div className="mt-6">
        <CoachSquads />
      </div>
    </div>
  );
}
