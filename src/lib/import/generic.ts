import { Readable } from "stream";
import unzipper from "unzipper";
import { commitImportedProblem, type ImportedCase } from "./commit";
import type { ImportItemOutcome } from "./types";
import type { Difficulty } from "../types";

type Entry = { path: string; buffer: Buffer };

type GenericMeta = {
  title: string;
  slug: string;
  difficulty?: Difficulty;
  time_limit_ms?: number;
  memory_limit_mb?: number;
};

/**
 * D3 — "a directory convention: statement.md + tests/*.in|.out + meta.json".
 * The house format for a bank that doesn't come from Polygon: one problem
 * per archive, no checker/reference-solution metadata beyond what meta.json
 * declares, so the publish gate will very often fail until a teacher adds a
 * reference solution — same "stays a draft" contract as the Polygon path.
 */
export async function parseGenericPackage(
  zipBuffer: Buffer,
  opts: { authorId: string; institutionId: string | null }
): Promise<ImportItemOutcome> {
  const entries: Entry[] = [];
  const source = Readable.from(zipBuffer);
  const zip = source.pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of zip as AsyncIterable<unzipper.Entry>) {
    if (entry.type !== "File") {
      entry.autodrain();
      continue;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of entry as AsyncIterable<Buffer>) chunks.push(chunk);
    entries.push({ path: entry.path, buffer: Buffer.concat(chunks) });
  }

  const metaEntry = entries.find((e) => /(^|\/)meta\.json$/.test(e.path));
  if (!metaEntry) {
    return { item: "meta.json", ok: false, message: "Archive has no meta.json." };
  }
  let meta: GenericMeta;
  try {
    meta = JSON.parse(metaEntry.buffer.toString("utf8"));
  } catch {
    return { item: "meta.json", ok: false, message: "meta.json is not valid JSON." };
  }
  if (!meta.title || !meta.slug) {
    return { item: "meta.json", ok: false, message: "meta.json must have title and slug." };
  }

  const statementEntry = entries.find((e) => /(^|\/)statement\.md$/.test(e.path));
  const statementMd = statementEntry?.buffer.toString("utf8") ?? `# ${meta.title}\n\n_Imported — statement needs review._`;

  const inputs = entries.filter((e) => /tests\/.*\.in$/.test(e.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  const warnings: string[] = [];
  const cases: ImportedCase[] = [];
  let idx = 0;
  for (const input of inputs) {
    const outPath = input.path.replace(/\.in$/, ".out");
    const output = entries.find((e) => e.path === outPath);
    if (!output) {
      warnings.push(`${input.path} has no matching ${outPath} — skipped.`);
      continue;
    }
    cases.push({ input: input.buffer.toString("utf8"), output: output.buffer.toString("utf8"), sample: idx < 2 });
    idx++;
  }
  if (cases.length === 0) {
    return { item: meta.slug, ok: false, message: "No usable tests/*.in + tests/*.out pairs found.", warnings };
  }

  try {
    const committed = await commitImportedProblem({
      authorId: opts.authorId,
      institutionId: opts.institutionId,
      title: meta.title,
      slug: meta.slug,
      statementMd,
      difficulty: meta.difficulty ?? "MEDIUM",
      timeLimitMs: meta.time_limit_ms,
      memoryLimitMb: meta.memory_limit_mb,
      cases,
      references: [],
      source: "Generic package",
    });
    warnings.push(...committed.gateBlockers.map((b) => `Publish gate: ${b}`));
    return {
      item: meta.slug,
      ok: true,
      problemId: committed.problemId,
      slug: committed.slug,
      warnings,
      message: "Imported as a draft — add a reference solution to pass the publish gate.",
    };
  } catch (err) {
    return { item: meta.slug, ok: false, message: err instanceof Error ? err.message : String(err), warnings };
  }
}
