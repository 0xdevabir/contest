import type { Contest, ContestRole, ContestVisibility, ParticipationMode, Prisma } from "@prisma/client";
import { randomInt } from "crypto";
import { prisma } from "./db";
import type { Actor } from "./authz";
import type { ContestPhase } from "./contests";
import { isEnrolledStudent } from "./section-access";

/**
 * docs/phases/PHASE-05-contest-engine.md — Access control. One function
 * returns everything the caller may do; pages and routes read from the set
 * rather than each re-deriving the visibility × joinPolicy × staff-role
 * matrix, so the message a student sees and the check the server makes can
 * never diverge.
 */
export type ContestCapability =
  | "view"
  | "viewProblems"
  | "register"
  | "submit"
  | "viewStandings"
  | "viewAllSubmissions"
  | "edit"
  | "manageStaff"
  | "rejudge";

export type ContestForAccess = Pick<
  Contest,
  "id" | "status" | "startsAt" | "endsAt" | "visibility" | "joinPolicy" | "institutionId" | "createdById" | "sectionId"
>;

export type ContestParticipationForAccess = { mode: ParticipationMode; official: boolean } | null;

const STAFF_CAN_EDIT: ContestRole[] = ["OWNER", "COAUTHOR"];
const STAFF_CAN_REJUDGE: ContestRole[] = ["OWNER", "COAUTHOR", "JUDGE"];
const STAFF_CAN_MANAGE: ContestRole[] = ["OWNER"];

/** Whether `actor` can see the contest exists at all — the gate every list
 * and detail read funnels through. DB-level filtering (see
 * `contestListWhere`) is what actually protects a listing; this is for a
 * direct id/slug fetch. */
function passesVisibility(
  actor: Actor,
  contest: ContestForAccess,
  isStaff: boolean,
  hasParticipation: boolean
): boolean {
  if (isStaff || hasParticipation) return true;
  switch (contest.visibility) {
    case "PUBLIC":
      return true;
    // Unlisted just means "not on /contests" — anyone with the link/slug can
    // still open it, same as an unlisted video.
    case "UNLISTED":
      return true;
    case "INSTITUTION":
      return Boolean(actor && contest.institutionId && actor.institutionId === contest.institutionId);
    case "PRIVATE":
      return false;
  }
}

/**
 * The single source of truth for what an actor may do on a contest. Looks up
 * the actor's `ContestStaff` row itself so callers don't have to remember to
 * fetch it — pass `participation` when you already loaded it (e.g. from the
 * dashboard query) to avoid a second lookup for registration status.
 */
export async function contestCapabilities(
  actor: Actor,
  contest: ContestForAccess,
  participation?: ContestParticipationForAccess
): Promise<Set<ContestCapability>> {
  const isAdmin = Boolean(actor && actor.role === "ADMIN");
  const staff = actor
    ? await prisma.contestStaff.findUnique({
        where: { contestId_userId: { contestId: contest.id, userId: actor.id } },
        select: { role: true },
      })
    : null;
  const isStaff = isAdmin || Boolean(staff);
  const hasParticipation = Boolean(participation);
  const canSee = passesVisibility(actor, contest, isStaff, hasParticipation);

  const caps = new Set<ContestCapability>();
  if (!canSee) return caps;

  caps.add("view");
  caps.add("viewProblems");
  caps.add("viewStandings");

  // Reaching this point already means `canSee` was true, which for a PRIVATE
  // contest requires staff/participant status — so a plain OPEN check is
  // sufficient here without re-deriving the visibility gate. ROSTER contests
  // (Phase 6) additionally require real section-Enrollment membership.
  if (actor && contest.joinPolicy === "OPEN") {
    caps.add("register");
  }
  if (
    actor &&
    contest.joinPolicy === "ROSTER" &&
    contest.sectionId &&
    (await isEnrolledStudent(actor.id, contest.sectionId))
  ) {
    caps.add("register");
  }
  if (hasParticipation || isStaff) caps.add("submit");

  if (isAdmin || (staff && STAFF_CAN_MANAGE.includes(staff.role))) caps.add("manageStaff");
  if (isAdmin || (staff && STAFF_CAN_EDIT.includes(staff.role))) caps.add("edit");
  if (isAdmin || (staff && STAFF_CAN_REJUDGE.includes(staff.role))) caps.add("rejudge");
  if (isStaff) caps.add("viewAllSubmissions");

  return caps;
}

export async function canAccessContest(actor: Actor, contest: ContestForAccess): Promise<boolean> {
  const caps = await contestCapabilities(actor, contest);
  return caps.has("view");
}

/**
 * Prisma `where` fragment for `/api/contests` — filters at the database
 * level, never in application code. `UNLISTED`/`PRIVATE` contests never
 * appear in a listing regardless of actor; they're only reachable by a
 * direct id/slug fetch that then goes through `contestCapabilities`.
 */
export function contestListWhere(actor: Actor): Prisma.ContestWhereInput {
  return {
    OR: [
      { visibility: "PUBLIC" },
      ...(actor?.institutionId
        ? [{ visibility: "INSTITUTION" as ContestVisibility, institutionId: actor.institutionId }]
        : []),
    ],
  };
}

/** 8 chars, no `0/O/1/l/I` — read aloud in a classroom without ambiguity. */
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

export function contestProblemHref({
  phase,
  registered,
  contestId,
  problemId,
}: {
  phase: ContestPhase;
  registered: boolean;
  contestId: string;
  problemId: string;
}): string | null {
  if (phase === "ENDED") return `/problems/${problemId}`;
  if (phase === "RUNNING" && registered) {
    return `/problems/${problemId}?contest=${contestId}`;
  }
  return null;
}

export function contestSubmissionError({
  contestOpen,
  contestEnded,
  problemIncluded,
  registered,
}: {
  contestOpen: boolean;
  contestEnded: boolean;
  problemIncluded: boolean;
  registered: boolean;
}): string | null {
  if (!contestOpen) {
    return contestEnded
      ? "This contest has ended — reopen the problem from the past contest to practise."
      : "Contest is not live";
  }
  if (!problemIncluded) return "This problem is not part of the contest";
  if (!registered) return "Register for the contest first";
  return null;
}
