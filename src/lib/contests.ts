import type { ContestStatus, Prisma } from "@prisma/client";
import { defaultContestRules, contestRulesSchema, type ContestRules } from "./validators";

export function parseRules(raw: Prisma.JsonValue | null | undefined): ContestRules {
  const parsed = contestRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : defaultContestRules;
}

export function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function contestStatusLabel(status: ContestStatus) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SCHEDULED":
      return "Scheduled";
    case "LIVE":
      return "Live";
    case "ENDED":
      return "Ended";
  }
}

export function isContestOpen(status: ContestStatus, startsAt?: Date | null, endsAt?: Date | null) {
  const now = Date.now();
  if (status === "LIVE") {
    if (endsAt && endsAt.getTime() < now) return false;
    if (startsAt && startsAt.getTime() > now) return false;
    return true;
  }
  return false;
}

/**
 * A contest only leaves LIVE when an admin presses End, so one whose window has
 * already closed is still stored as LIVE. Left alone it is neither open nor
 * archived, which hides it from everyone — including the people who joined it.
 */
export function effectiveContestStatus(
  status: ContestStatus,
  endsAt: Date | null | undefined
): ContestStatus {
  if (status === "LIVE" && endsAt && endsAt.getTime() < Date.now()) return "ENDED";
  return status;
}

export function isContestPublic(
  status: ContestStatus,
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
  rawRules: Prisma.JsonValue | null | undefined
) {
  if (isContestOpen(status, startsAt, endsAt)) return true;
  return (
    effectiveContestStatus(status, endsAt) === "ENDED" &&
    parseRules(rawRules).publishAfterEnd
  );
}

