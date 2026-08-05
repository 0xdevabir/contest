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

export function isContestPublic(
  status: ContestStatus,
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
  rawRules: Prisma.JsonValue | null | undefined
) {
  if (isContestOpen(status, startsAt, endsAt)) return true;
  return status === "ENDED" && parseRules(rawRules).publishAfterEnd;
}
