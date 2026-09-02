import { readFileSync } from "fs";
import path from "path";
import { cache } from "react";
import { DIFFICULTY_ORDER, prismaDifficultyToLabel } from "./difficulty";
import { isEnabled } from "./flags";
import { prisma } from "./db";
import { getBlobStore } from "./blob";
import type {
  CategorySummary,
  Difficulty,
  Problem,
  ProblemBank,
  SetSummary,
  TestCase,
} from "./types";

// ---------------------------------------------------------------------
// Legacy JSON-backed reader — the disaster-recovery / rollback path. The
// `problemDb` flag (off -> JSON, on -> DB) is what makes this a real
// rollback: flipping the flag switches *reads* back to this file with no
// data loss, since Phase 2's migration never deletes data/problems.json or
// stops writing the legacy string columns.
// ---------------------------------------------------------------------

let jsonCache: ProblemBank | null = null;

function readJsonBank(): ProblemBank {
  if (jsonCache) return jsonCache;
  const file = path.join(process.cwd(), "data", "problems.json");
  jsonCache = JSON.parse(readFileSync(file, "utf8")) as ProblemBank;
  return jsonCache;
}

function getBankJson(): ProblemBank {
  return readJsonBank();
}

function getSetsJson(): SetSummary[] {
  return readJsonBank().sets;
}

function getCategoriesJson(): CategorySummary[] {
  const bank = readJsonBank();
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

function getProblemJson(id: string): Problem | undefined {
  return readJsonBank().problems[id];
}

function getAllProblemIdsJson(): string[] {
  const order = new Map(DIFFICULTY_ORDER.map((d, i) => [d, i]));
  return Object.values(readJsonBank().problems)
    .sort((a, b) => {
      const da = order.get(a.difficulty) ?? 99;
      const db = order.get(b.difficulty) ?? 99;
      if (da !== db) return da - db;
      if (a.source !== b.source) return a.source === "authored" ? -1 : 1;
      return a.set - b.set || a.question - b.question || a.id.localeCompare(b.id);
    })
    .map((p) => p.id);
}

function getMetaJson() {
  return readJsonBank().meta;
}

let legacySetTitlesCache: Map<number, string> | null = null;

/** The 20 curriculum "Set N — Title" labels, read once from the JSON bank so
 * imported legacy problems keep their grouping display even though
 * `ProblemVersion` (correctly) has no `setTitle` column of its own. */
function legacySetTitles(): Map<number, string> {
  if (legacySetTitlesCache) return legacySetTitlesCache;
  const map = new Map<number, string>();
  try {
    for (const set of readJsonBank().sets) map.set(set.set, set.title);
  } catch {
    // Missing data/problems.json in a DB-only deployment is fine — legacy
    // set titles just fall back to "Set N" below.
  }
  legacySetTitlesCache = map;
  return map;
}

// ---------------------------------------------------------------------
// DB-backed reader (Phase 2). Same view shape (`Problem`) as the JSON
// reader so the ~15 existing call sites only need `await` added.
// ---------------------------------------------------------------------

const PUBLIC_WHERE = { status: "PUBLISHED" as const, visibility: "PUBLIC" as const };

async function resolveCaseContent(
  inline: string | null,
  key: string | null
): Promise<string> {
  if (inline != null) return inline;
  if (!key) return "";
  const store = getBlobStore();
  return (await store.get(key)).toString("utf8");
}

/** Full single-problem view with real test content — used by getProblem(). */
async function dbProblemToFullView(row: {
  slug: string;
  title: string;
  legacySet: number | null;
  legacyQuestion: number | null;
  difficulty: import("@prisma/client").Difficulty;
  tags: { tag: { name: string } }[];
  currentVersion: {
    statementMd: string;
    inputSpec: string;
    outputSpec: string;
    constraints: string;
    timeLimitMs: number;
    memoryLimitMb: number;
    starterCode: unknown;
    maxScore: number;
    groups: {
      isSample: boolean;
      cases: { order: number; inputInline: string | null; inputKey: string | null; expectedInline: string | null; expectedKey: string | null }[];
    }[];
  };
}): Promise<Problem> {
  const tests: TestCase[] = [];
  let sampleInput = "";
  let sampleOutput = "";
  let sampleSet = false;

  for (const group of row.currentVersion.groups) {
    for (const c of group.cases) {
      const input = await resolveCaseContent(c.inputInline, c.inputKey);
      const output = await resolveCaseContent(c.expectedInline, c.expectedKey);
      tests.push({ input, output, sample: group.isSample });
      if (group.isSample && !sampleSet) {
        sampleInput = input;
        sampleOutput = output;
        sampleSet = true;
      }
    }
  }

  const starter = row.currentVersion.starterCode as Record<string, string> | null;

  return {
    id: row.slug,
    set: row.legacySet ?? 0,
    question: row.legacyQuestion ?? 0,
    title: row.title,
    difficulty: prismaDifficultyToLabel(row.difficulty),
    setTitle: row.legacySet != null ? legacySetTitles().get(row.legacySet) ?? `Set ${row.legacySet}` : "",
    topic: row.tags[0]?.tag.name,
    source: "authored",
    statement: row.currentVersion.statementMd,
    input: row.currentVersion.inputSpec,
    output: row.currentVersion.outputSpec,
    constraints: row.currentVersion.constraints,
    sampleInput,
    sampleOutput,
    tests,
    starterCode: starter?.c ?? "",
    timeLimitMs: row.currentVersion.timeLimitMs,
    memoryLimitMb: row.currentVersion.memoryLimitMb,
    // maxScore 0 is the faithful DB equivalent of the legacy `openEnded`
    // flag (see the import script) — NOT "no non-sample tests exist": a
    // problem whose only test is sample-flagged is still fully gradeable,
    // the judge grades every test regardless of its `sample` display flag.
    openEnded: row.currentVersion.maxScore === 0,
  };
}

type LightRow = {
  slug: string;
  title: string;
  legacySet: number | null;
  legacyQuestion: number | null;
  difficulty: import("@prisma/client").Difficulty;
  tags: { tag: { name: string } }[];
  currentVersion: {
    inputSpec: string;
    outputSpec: string;
    constraints: string;
    timeLimitMs: number;
    memoryLimitMb: number;
    maxScore: number;
    groups: { isSample: boolean; _count: { cases: number } }[];
  } | null;
};

/** Listing-shaped view: no blob reads, `tests` is a correctly-sized array of
 * empty placeholders (every existing bulk caller only reads `.tests.length`
 * or `.openEnded`, never test content, in listing contexts). */
function dbProblemToLightView(row: LightRow): Problem | null {
  if (!row.currentVersion) return null;
  const groups = row.currentVersion.groups;
  const sampleCount = groups.filter((g) => g.isSample).reduce((n, g) => n + g._count.cases, 0);
  const gradedCount = groups.filter((g) => !g.isSample).reduce((n, g) => n + g._count.cases, 0);
  const tests: TestCase[] = [
    ...Array.from({ length: sampleCount }, () => ({ input: "", output: "", sample: true })),
    ...Array.from({ length: gradedCount }, () => ({ input: "", output: "", sample: false })),
  ];

  return {
    id: row.slug,
    set: row.legacySet ?? 0,
    question: row.legacyQuestion ?? 0,
    title: row.title,
    difficulty: prismaDifficultyToLabel(row.difficulty),
    setTitle: row.legacySet != null ? legacySetTitles().get(row.legacySet) ?? `Set ${row.legacySet}` : "",
    topic: row.tags[0]?.tag.name,
    source: "authored",
    statement: "",
    input: row.currentVersion.inputSpec,
    output: row.currentVersion.outputSpec,
    constraints: row.currentVersion.constraints,
    sampleInput: "",
    sampleOutput: "",
    tests,
    starterCode: "",
    timeLimitMs: row.currentVersion.timeLimitMs,
    memoryLimitMb: row.currentVersion.memoryLimitMb,
    openEnded: row.currentVersion.maxScore === 0,
  };
}

const LIGHT_INCLUDE = {
  tags: { include: { tag: true }, orderBy: { weight: "desc" as const }, take: 1 },
  currentVersion: {
    select: {
      inputSpec: true,
      outputSpec: true,
      constraints: true,
      timeLimitMs: true,
      memoryLimitMb: true,
      maxScore: true,
      groups: { select: { isSample: true, _count: { select: { cases: true } } } },
    },
  },
};

/** Cached per-request (React `cache()`  dedupes across every call within one
 * render pass) — the DB equivalent of the JSON reader's module-level cache. */
const getBankDb = cache(async (): Promise<ProblemBank> => {
  const rows = await prisma.problem.findMany({
    where: PUBLIC_WHERE,
    include: LIGHT_INCLUDE,
    orderBy: [{ legacySet: "asc" }, { legacyQuestion: "asc" }],
  });

  const problems: Record<string, Problem> = {};
  for (const row of rows) {
    const view = dbProblemToLightView(row);
    if (view) problems[row.slug] = view;
  }

  const legacyRows = rows.filter((r) => r.legacySet != null);
  const setNumbers = [...new Set(legacyRows.map((r) => r.legacySet!))].sort((a, b) => a - b);
  const sets: SetSummary[] = setNumbers.map((setNum) => ({
    set: setNum,
    title: legacySetTitles().get(setNum) ?? `Set ${setNum}`,
    problems: legacyRows
      .filter((r) => r.legacySet === setNum)
      .sort((a, b) => (a.legacyQuestion ?? 0) - (b.legacyQuestion ?? 0))
      .map((r) => ({
        id: r.slug,
        question: r.legacyQuestion ?? 0,
        title: r.title,
        difficulty: prismaDifficultyToLabel(r.difficulty),
      })),
  }));

  return {
    meta: {
      title: "DIU ContestHub Problem Bank",
      subtitle: "Teacher-authored problems, database-backed",
      language: "C",
      sets: sets.length,
      problemsPerSet: sets.length ? Math.round(rows.length / Math.max(sets.length, 1)) : 0,
      total: rows.length,
      tiers: DIFFICULTY_ORDER,
      problemsPerTier: Math.round(rows.length / DIFFICULTY_ORDER.length),
    },
    sets,
    problems,
  };
});

async function getBankDbImpl(): Promise<ProblemBank> {
  return getBankDb();
}

async function getCategoriesDbImpl(): Promise<CategorySummary[]> {
  const bank = await getBankDbImpl();
  const byTier = new Map<Difficulty, CategorySummary["problems"]>();
  for (const tier of DIFFICULTY_ORDER) byTier.set(tier, []);
  for (const p of Object.values(bank.problems)) {
    byTier.get(p.difficulty)?.push({
      id: p.id,
      title: p.title,
      difficulty: p.difficulty,
      topic: p.topic,
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

async function getProblemDbImpl(id: string): Promise<Problem | undefined> {
  const row = await prisma.problem.findFirst({
    where: { slug: id, ...PUBLIC_WHERE },
    include: {
      tags: { include: { tag: true }, orderBy: { weight: "desc" }, take: 1 },
      currentVersion: {
        include: { groups: { orderBy: { order: "asc" }, include: { cases: { orderBy: { order: "asc" } } } } },
      },
    },
  });
  if (!row || !row.currentVersion) return undefined;
  return dbProblemToFullView({ ...row, currentVersion: row.currentVersion });
}

/**
 * Phase 10 D3 — the same `dbProblemToFullView` shape as `getProblemDbImpl`,
 * but for one specific frozen `ProblemVersion` (a generated variant) rather
 * than a problem's current version. Used to judge/render a participant's own
 * parameterised statement + test data.
 */
export async function getProblemVersionView(versionId: string): Promise<Problem | undefined> {
  const version = await prisma.problemVersion.findUnique({
    where: { id: versionId },
    include: {
      groups: { orderBy: { order: "asc" }, include: { cases: { orderBy: { order: "asc" } } } },
      problem: {
        include: { tags: { include: { tag: true }, orderBy: { weight: "desc" }, take: 1 } },
      },
    },
  });
  if (!version) return undefined;
  return dbProblemToFullView({
    slug: version.problem.slug,
    title: version.problem.title,
    legacySet: version.problem.legacySet,
    legacyQuestion: version.problem.legacyQuestion,
    difficulty: version.problem.difficulty,
    tags: version.problem.tags,
    currentVersion: version,
  });
}

async function getAllProblemIdsDbImpl(): Promise<string[]> {
  const order = new Map(DIFFICULTY_ORDER.map((d, i) => [d, i]));
  const rows = await prisma.problem.findMany({
    where: PUBLIC_WHERE,
    select: { slug: true, difficulty: true, legacySet: true, legacyQuestion: true },
  });
  return rows
    .sort((a, b) => {
      const da = order.get(prismaDifficultyToLabel(a.difficulty)) ?? 99;
      const db = order.get(prismaDifficultyToLabel(b.difficulty)) ?? 99;
      if (da !== db) return da - db;
      const sa = a.legacySet ?? Number.MAX_SAFE_INTEGER;
      const sb = b.legacySet ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      const qa = a.legacyQuestion ?? Number.MAX_SAFE_INTEGER;
      const qb = b.legacyQuestion ?? Number.MAX_SAFE_INTEGER;
      if (qa !== qb) return qa - qb;
      return a.slug.localeCompare(b.slug);
    })
    .map((r) => r.slug);
}

// ---------------------------------------------------------------------
// Public API — same signatures as before Phase 2, now async, dispatching to
// the DB reader when the `problemDb` flag is on and the JSON reader
// otherwise (this *is* the rollback mechanism — see docs/phases/PHASE-02).
// ---------------------------------------------------------------------

async function problemDbEnabled(): Promise<boolean> {
  return isEnabled("problemDb");
}

export async function getBank(): Promise<ProblemBank> {
  return (await problemDbEnabled()) ? getBankDbImpl() : getBankJson();
}

export async function getSets(): Promise<SetSummary[]> {
  return (await problemDbEnabled()) ? (await getBankDbImpl()).sets : getSetsJson();
}

export async function getCategories(): Promise<CategorySummary[]> {
  return (await problemDbEnabled()) ? getCategoriesDbImpl() : getCategoriesJson();
}

export async function getProblem(id: string): Promise<Problem | undefined> {
  return (await problemDbEnabled()) ? getProblemDbImpl(id) : getProblemJson(id);
}

export async function getAllProblemIds(): Promise<string[]> {
  return (await problemDbEnabled()) ? getAllProblemIdsDbImpl() : getAllProblemIdsJson();
}

export async function getMeta() {
  return (await problemDbEnabled()) ? (await getBankDbImpl()).meta : getMetaJson();
}

/**
 * The real `Problem`/`ProblemVersion` row ids behind a legacy slug, when
 * DB-backed — used to populate `Submission.problemRefId`/`problemVersionId`
 * at write time so newly-created rows never need the link-refs backfill
 * script to catch up (only pre-migration history does).
 */
export async function getProblemRef(
  slug: string
): Promise<{ problemId: string; versionId: string | null } | null> {
  if (!(await problemDbEnabled())) return null;
  const row = await prisma.problem.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    select: { id: true, currentVersionId: true },
  });
  if (!row) return null;
  return { problemId: row.id, versionId: row.currentVersionId };
}

export type ProblemOption = {
  id: string;
  title: string;
  set: number;
  question: number;
  difficulty: Difficulty;
};

/** Batch title lookup for admin list views (submissions, analytics, user
 * detail) that render a problem title per row without needing full content. */
export async function getProblemTitles(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const entries = await Promise.all(
    unique.map(async (id) => [id, (await getProblem(id))?.title ?? id] as const)
  );
  return new Map(entries);
}

/** Lightweight list for admin contest-problem pickers — avoids resolving
 * every problem's full test content just to build an `<option>` list. */
export async function getProblemOptions(): Promise<ProblemOption[]> {
  const bank = await getBank();
  return Object.values(bank.problems).map((p) => ({
    id: p.id,
    title: p.title,
    set: p.set,
    question: p.question,
    difficulty: p.difficulty,
  }));
}
