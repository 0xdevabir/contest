import type { ContestStatus, Prisma } from "@prisma/client";
import {
  defaultContestRulesV2,
  contestRulesSchemaV1,
  contestRulesSchemaV2,
  defaultContestRulesV1,
  type ContestRules,
} from "./validators";

/**
 * `rulesVersion` is the discriminant: missing/1 is the pre-Phase-5 shape and
 * gets upgraded to v2 defaults on read (shared field names carry over
 * unchanged); `2` validates directly. The stored `Contest.rules` blob is
 * never rewritten by this — only the in-memory value callers see.
 */
export function parseRules(raw: Prisma.JsonValue | null | undefined): ContestRules {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  if (obj.rulesVersion === 2) {
    const parsed = contestRulesSchemaV2.safeParse(obj);
    return parsed.success ? parsed.data : defaultContestRulesV2;
  }

  const legacy = contestRulesSchemaV1.safeParse(obj);
  return { ...defaultContestRulesV2, ...(legacy.success ? legacy.data : defaultContestRulesV1), rulesVersion: 2 };
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

export type ContestPhase = "BEFORE" | "RUNNING" | "ENDED";

export function contestPhase(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
  now = Date.now()
): ContestPhase {
  if (endsAt && endsAt.getTime() <= now) return "ENDED";
  if (startsAt && startsAt.getTime() > now) return "BEFORE";
  return "RUNNING";
}

/**
 * LIVE means the admin has published the contest, not that it is running right
 * now — a published contest is visible before it starts too, otherwise nobody
 * could find it to register. DRAFT and SCHEDULED stay hidden, and a finished
 * contest is only listed when the admin opted into publishing the archive.
 */
export function isContestPublic(
  status: ContestStatus,
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
  rawRules: Prisma.JsonValue | null | undefined
) {
  const effective = effectiveContestStatus(status, endsAt);
  if (effective === "LIVE") return true;
  return effective === "ENDED" && parseRules(rawRules).publishAfterEnd;
}


