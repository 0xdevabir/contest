import type { Difficulty } from "./types";

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
