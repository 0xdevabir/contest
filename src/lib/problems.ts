import { readFileSync } from "fs";
import path from "path";
import { DIFFICULTY_ORDER } from "./difficulty";
import type {
  CategorySummary,
  Difficulty,
  Problem,
  ProblemBank,
  SetSummary,
} from "./types";

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

export function getCategories(): CategorySummary[] {
  const bank = getBank();
  if (bank.categories?.length) return bank.categories;

  const byTier = new Map<Difficulty, CategorySummary["problems"]>();
  for (const tier of DIFFICULTY_ORDER) byTier.set(tier, []);

  for (const p of Object.values(bank.problems)) {
    byTier.get(p.difficulty)?.push({
      id: p.id,
      title: p.title,
      difficulty: p.difficulty,
      topic: p.topic ?? p.setTitle,
      source: p.source,
      set: p.set,
      question: p.question,
    });
  }

  return DIFFICULTY_ORDER.map((tier) => ({
    tier,
    count: byTier.get(tier)?.length ?? 0,
    problems: byTier.get(tier) ?? [],
  }));
}

export function getProblem(id: string): Problem | undefined {
  return getBank().problems[id];
}

export function getAllProblemIds(): string[] {
  const order = new Map(DIFFICULTY_ORDER.map((d, i) => [d, i]));
  return Object.values(getBank().problems)
    .sort((a, b) => {
      const da = order.get(a.difficulty) ?? 99;
      const db = order.get(b.difficulty) ?? 99;
      if (da !== db) return da - db;
      if (a.source !== b.source) return a.source === "authored" ? -1 : 1;
      return a.set - b.set || a.question - b.question || a.id.localeCompare(b.id);
    })
    .map((p) => p.id);
}

export function getMeta() {
  return getBank().meta;
}
