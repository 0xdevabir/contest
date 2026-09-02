import type { Difficulty as PrismaDifficulty } from "@prisma/client";
import type { Difficulty } from "./types";

/**
 * Prisma enum identifiers can't contain spaces/hyphens, so Problem.difficulty
 * is stored as VERY_EASY/MEDIUM_HARD/etc (see schema.prisma's @map comment).
 * Every reader of DB-backed problem data converts at this boundary so the
 * rest of the app keeps using the legacy "VERY EASY" labels unchanged.
 */
const PRISMA_TO_LABEL: Record<PrismaDifficulty, Difficulty> = {
  VERY_EASY: "VERY EASY",
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  MEDIUM_HARD: "MEDIUM-HARD",
  HARD: "HARD",
  VERY_HARD: "VERY HARD",
  EXTREME: "EXTREME",
};

const LABEL_TO_PRISMA: Record<Difficulty, PrismaDifficulty> = {
  "VERY EASY": "VERY_EASY",
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  "MEDIUM-HARD": "MEDIUM_HARD",
  HARD: "HARD",
  "VERY HARD": "VERY_HARD",
  EXTREME: "EXTREME",
};

export function prismaDifficultyToLabel(d: PrismaDifficulty): Difficulty {
  return PRISMA_TO_LABEL[d];
}

export function labelToPrismaDifficulty(d: Difficulty): PrismaDifficulty {
  return LABEL_TO_PRISMA[d];
}

export const DIFFICULTY_ORDER: Difficulty[] = [
  "VERY EASY",
  "EASY",
  "MEDIUM",
  "MEDIUM-HARD",
  "HARD",
  "VERY HARD",
  "EXTREME",
];

export function difficultyClass(d: Difficulty): string {
  switch (d) {
    case "VERY EASY":
      return "diff-ve";
    case "EASY":
      return "diff-e";
    case "MEDIUM":
      return "diff-m";
    case "MEDIUM-HARD":
      return "diff-mh";
    case "HARD":
      return "diff-h";
    case "VERY HARD":
      return "diff-vh";
    case "EXTREME":
      return "diff-x";
    default:
      return "diff-m";
  }
}
