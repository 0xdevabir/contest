import { parseCsv } from "../csv";
import { createProblem } from "../problem-authoring";
import type { ImportItemOutcome } from "./types";
import type { Difficulty } from "../types";

const DIFFICULTIES: Difficulty[] = ["VERY EASY", "EASY", "MEDIUM", "MEDIUM-HARD", "HARD", "VERY HARD", "EXTREME"];

type CsvRow = { title: string; slug: string; difficulty: Difficulty; statement_md: string };

function normalizeDifficulty(raw: string): Difficulty {
  const upper = raw.trim().toUpperCase();
  const found = DIFFICULTIES.find((d) => d.toUpperCase() === upper);
  return found ?? "MEDIUM";
}

/**
 * D3 — "vJudge-style CSV/JSON bulk problem import ... metadata-only import
 * for an existing question bank." No tests, no reference solutions — every
 * imported row lands as a DRAFT (createProblem's default) that a teacher
 * fills in with content before it can pass the publish gate. Columns:
 * title, slug, difficulty, statement_md (CSV header row required).
 */
export async function parseCsvBank(
  text: string,
  opts: { authorId: string; institutionId: string | null }
): Promise<ImportItemOutcome[]> {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    title: header.indexOf("title"),
    slug: header.indexOf("slug"),
    difficulty: header.indexOf("difficulty"),
    statement: header.indexOf("statement_md"),
  };
  if (idx.title < 0 || idx.slug < 0) {
    return [{ item: "header", ok: false, message: "CSV must have title and slug columns." }];
  }

  const results: ImportItemOutcome[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((c) => c.trim() === "")) continue;
    const parsed: CsvRow = {
      title: row[idx.title]?.trim() ?? "",
      slug: row[idx.slug]?.trim() ?? "",
      difficulty: idx.difficulty >= 0 ? normalizeDifficulty(row[idx.difficulty] ?? "") : "MEDIUM",
      statement_md: idx.statement >= 0 && row[idx.statement] ? row[idx.statement] : "_Imported — statement needs review._",
    };
    if (!parsed.title || !parsed.slug) {
      results.push({ item: parsed.slug || parsed.title || "(row)", ok: false, message: "Missing title or slug." });
      continue;
    }
    try {
      const problem = await createProblem(opts.authorId, opts.institutionId, {
        title: parsed.title,
        slug: parsed.slug,
        difficulty: parsed.difficulty,
        visibility: "PRIVATE",
        statementMd: parsed.statement_md,
      });
      results.push({
        item: parsed.slug,
        ok: true,
        problemId: problem.id,
        slug: problem.slug,
        message: "Imported as a draft — add tests and a reference solution before publishing.",
      });
    } catch (err) {
      results.push({ item: parsed.slug, ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
