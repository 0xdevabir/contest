import { readFileSync } from "fs";
import path from "path";
import type { Problem, ProblemBank, SetSummary } from "./types";

let cache: ProblemBank | null = null;

export function getBank(): ProblemBank {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "problems.json");
  cache = JSON.parse(readFileSync(file, "utf8")) as ProblemBank;
  return cache;
}

export function getSets(): SetSummary[] {
  return getBank().sets;
}

export function getProblem(id: string): Problem | undefined {
  return getBank().problems[id];
}

export function getAllProblemIds(): string[] {
  return Object.keys(getBank().problems);
}

export function getMeta() {
  return getBank().meta;
}
