import { describe, it, expect } from "vitest";
import { DIFFICULTY_ORDER, difficultyClass } from "./difficulty";
import type { Difficulty } from "./types";

describe("DIFFICULTY_ORDER", () => {
  it("is ordered from easiest to hardest", () => {
    expect(DIFFICULTY_ORDER).toEqual([
      "VERY EASY",
      "EASY",
      "MEDIUM",
      "MEDIUM-HARD",
      "HARD",
      "VERY HARD",
      "EXTREME",
    ]);
  });
});

describe("difficultyClass", () => {
  it("maps every known tier to a distinct class", () => {
    const classes = new Set(DIFFICULTY_ORDER.map(difficultyClass));
    expect(classes.size).toBe(DIFFICULTY_ORDER.length);
  });

  it("falls back to the medium class for an unknown tier", () => {
    expect(difficultyClass("nonsense" as Difficulty)).toBe("diff-m");
  });
});
