#!/usr/bin/env node
/**
 * Convert data/problem-bank-700-raw.json → data/problems.json
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const TIERS = [
  "VERY EASY",
  "EASY",
  "MEDIUM",
  "MEDIUM-HARD",
  "HARD",
  "VERY HARD",
  "EXTREME",
];

const STARTER = `#include <stdio.h>

int main() {
    // your code here
    return 0;
}
`;

const LIMITS = {
  "VERY EASY": { timeLimitMs: 2000, memoryLimitMb: 256 },
  EASY: { timeLimitMs: 2000, memoryLimitMb: 256 },
  MEDIUM: { timeLimitMs: 2000, memoryLimitMb: 256 },
  "MEDIUM-HARD": { timeLimitMs: 3000, memoryLimitMb: 256 },
  HARD: { timeLimitMs: 3000, memoryLimitMb: 512 },
  "VERY HARD": { timeLimitMs: 5000, memoryLimitMb: 512 },
  EXTREME: { timeLimitMs: 5000, memoryLimitMb: 512 },
};

/** Strip trailing parenthetical explanations from sample answers. */
function cleanSampleOutput(raw) {
  if (!raw || raw === "—") return "";
  const lines = String(raw).split("\n");
  const cleaned = lines.map((line) => {
    // "2 (25+5)" / "3 (\"abc\")" / "1 0 1 1 1 (example — verify)"
    const m = line.match(/^(.+?)\s+\((?:[^)]|\([^)]*\))*\)\s*$/);
    if (m && !m[1].includes("(")) return m[1].trimEnd();
    return line;
  });
  return cleaned.join("\n").trimEnd();
}

function parseAuthoredId(id) {
  const m = /^S(\d+)Q(\d+)$/i.exec(id);
  if (!m) return null;
  return { set: Number(m[1]), question: Number(m[2]) };
}

function toPlatformId(rawId, source) {
  if (source === "authored") {
    const p = parseAuthoredId(rawId);
    if (p) return `set${p.set}-q${p.question}`;
  }
  return rawId.toLowerCase();
}

function isOpenEnded(p) {
  const blank = (v) => !v || v === "—" || v.trim() === "—";
  if (blank(p.input) && blank(p.output)) return true;
  if (blank(p.sample_input) && blank(p.sample_output)) return true;
  if (/design your own/i.test(p.topic || "")) return true;
  if (/full contest simulator|original challenge/i.test(p.title || "")) return true;
  return false;
}

function buildTests(sampleIn, sampleOut, openEnded) {
  if (openEnded) return [];
  const input = sampleIn === "—" ? "" : String(sampleIn ?? "");
  const output = cleanSampleOutput(sampleOut);
  if (!input && !output) return [];
  return [{ input, output, sample: true }];
}

const raw = JSON.parse(
  readFileSync(path.join(root, "data", "problem-bank-700-raw.json"), "utf8")
);

const problems = {};
const setMap = new Map(); // set number → { set, title, problems[] }

for (const tier of TIERS) {
  const list = raw.tiers[tier] || [];
  let genQuestion = 0;
  for (const p of list) {
    const authored = parseAuthoredId(p.id);
    const id = toPlatformId(p.id, p.source);
    const openEnded = isOpenEnded(p);
    const sampleInput = p.sample_input === "—" ? "" : String(p.sample_input ?? "");
    const sampleOutput = cleanSampleOutput(p.sample_output);
    const limits = LIMITS[tier] || LIMITS.MEDIUM;

    let setNum;
    let question;
    let setTitle = p.topic || tier;

    if (authored) {
      setNum = authored.set;
      question = authored.question;
      setTitle = p.topic;
    } else {
      // Generated: synthetic set 100+tierIndex so they don't collide with 1–20
      setNum = 100 + TIERS.indexOf(tier);
      genQuestion += 1;
      question = genQuestion;
      setTitle = `${tier} · Extra practice`;
    }

    const problem = {
      id,
      set: setNum,
      question,
      title: p.title,
      difficulty: tier,
      setTitle: authored ? p.topic : setTitle,
      topic: p.topic,
      source: p.source || "generated",
      statement: p.statement,
      input: p.input === "—" ? "" : p.input,
      output: p.output === "—" ? "" : p.output,
      constraints: p.constraints === "—" ? "" : p.constraints,
      sampleInput,
      sampleOutput,
      tests: buildTests(sampleInput, sampleOutput, openEnded),
      starterCode: STARTER,
      timeLimitMs: limits.timeLimitMs,
      memoryLimitMb: limits.memoryLimitMb,
      ...(openEnded ? { openEnded: true } : {}),
    };

    if (problems[id]) {
      console.warn("duplicate id", id);
    }
    problems[id] = problem;

    // Curriculum sets 1–20 only from authored
    if (authored) {
      if (!setMap.has(setNum)) {
        setMap.set(setNum, { set: setNum, title: p.topic, problems: [] });
      }
      const s = setMap.get(setNum);
      // Prefer Q1 topic as set title (set titles match Q1's topic in original bank)
      if (question === 1) s.title = p.topic.replace(/\s*—.*$/, "").trim() || p.topic;
      s.problems.push({
        id,
        question,
        title: p.title,
        difficulty: tier,
      });
    }
  }
}

const sets = [...setMap.values()]
  .sort((a, b) => a.set - b.set)
  .map((s) => ({
    ...s,
    problems: s.problems.sort((a, b) => a.question - b.question),
  }));

// Fix set titles from existing bank when possible (richer names)
try {
  const old = JSON.parse(readFileSync(path.join(root, "data", "problems.json"), "utf8"));
  for (const oldSet of old.sets || []) {
    const s = sets.find((x) => x.set === oldSet.set);
    if (s && oldSet.title) s.title = oldSet.title;
  }
} catch {
  /* first build */
}

const categories = TIERS.map((tier) => {
  const items = Object.values(problems)
    .filter((p) => p.difficulty === tier)
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === "authored" ? -1 : 1;
      return a.set - b.set || a.question - b.question || a.id.localeCompare(b.id);
    })
    .map((p) => ({
      id: p.id,
      title: p.title,
      difficulty: p.difficulty,
      topic: p.topic,
      source: p.source,
      set: p.set,
      question: p.question,
    }));
  return { tier, count: items.length, problems: items };
});

const bank = {
  meta: {
    title: "DIU ContestHub Problem Bank",
    subtitle: "7 difficulty tiers × 100 problems — exam-style C practice",
    language: "C",
    sets: sets.length,
    problemsPerSet: 7,
    total: Object.keys(problems).length,
    tiers: TIERS,
    problemsPerTier: 100,
  },
  sets,
  categories,
  problems,
};

const out = path.join(root, "data", "problems.json");
writeFileSync(out, JSON.stringify(bank));
console.log(
  `Wrote ${bank.meta.total} problems, ${sets.length} sets, ${categories.length} categories → ${out}`
);
console.log(
  "by tier:",
  Object.fromEntries(categories.map((c) => [c.tier, c.count]))
);
console.log(
  "openEnded:",
  Object.values(problems).filter((p) => p.openEnded).length
);
