import { Readable } from "stream";
import unzipper from "unzipper";
import { XMLParser } from "fast-xml-parser";
import { convertLatexToMarkdown } from "./latex";
import { commitImportedProblem, type ImportedCase, type ImportedReference } from "./commit";
import type { ImportItemOutcome } from "./types";

/**
 * D3's mapping table:
 *   problem.xml -> names/time-limit/memory-limit -> ProblemVersion limits
 *   statements/.../problem.tex or problem-properties.json -> statementMd
 *   tests/NN, tests/NN.a -> TestCase
 *   solutions/ tagged main/accepted/time-limit-exceeded -> ReferenceSolution
 *   files/check.cpp -> checkerType SPECIAL (recorded, not compiled — the
 *     judge only executes C reference solutions today; a SPECIAL checker
 *     import is reported as a warning, matching runPublishGate's own
 *     "only C is auto-verified" rule)
 */
type Entry = { path: string; buffer: Buffer };

const VERDICT_TAGS: Record<string, ImportedReference["expectedVerdict"]> = {
  main: "AC",
  accepted: "AC",
  "time-limit-exceeded": "TLE",
  "wrong-answer": "WA",
  "runtime-error": "RE",
  "memory-limit-exceeded": "MLE",
};

async function readZipEntries(zipBuffer: Buffer): Promise<Entry[]> {
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
  return entries;
}

function findEntry(entries: Entry[], suffix: RegExp): Entry | undefined {
  return entries.find((e) => suffix.test(e.path));
}

function textOf(entries: Entry[], suffix: RegExp): string | undefined {
  return findEntry(entries, suffix)?.buffer.toString("utf8");
}

export async function parsePolygonPackage(
  zipBuffer: Buffer,
  opts: { authorId: string; institutionId: string | null; slugPrefix: string }
): Promise<ImportItemOutcome> {
  const warnings: string[] = [];
  const entries = await readZipEntries(zipBuffer);

  const xmlText = textOf(entries, /(^|\/)problem\.xml$/);
  if (!xmlText) {
    return { item: "problem.xml", ok: false, message: "Archive has no problem.xml — not a Polygon package." };
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xmlText) as {
    problem?: {
      "@_short-name"?: string;
      names?: { name?: { "@_value"?: string } | { "@_value"?: string }[] };
      judging?: { testset?: { "time-limit"?: number; "memory-limit"?: number } | { "time-limit"?: number; "memory-limit"?: number }[] };
    };
  };

  const shortName = doc.problem?.["@_short-name"] ?? opts.slugPrefix;
  const namesRaw = doc.problem?.names?.name;
  const firstName = Array.isArray(namesRaw) ? namesRaw[0] : namesRaw;
  const title = firstName?.["@_value"] ?? shortName;

  const testsetRaw = doc.problem?.judging?.testset;
  const testset = Array.isArray(testsetRaw) ? testsetRaw[0] : testsetRaw;
  const timeLimitMs = Number(testset?.["time-limit"] ?? 2000);
  const memoryLimitBytes = Number(testset?.["memory-limit"] ?? 256 * 1024 * 1024);
  const memoryLimitMb = Math.max(16, Math.round(memoryLimitBytes / (1024 * 1024)));

  // Statement: prefer problem-properties.json (has plain legend text),
  // otherwise fall back to a .tex file and run it through the LaTeX subset
  // converter. Neither present is not fatal — the import still lands as a
  // draft the teacher can fill in.
  let statementMd = `# ${title}\n\n_Imported from a Polygon package — statement needs review._`;
  const propsText = textOf(entries, /statements\/.*problem-properties\.json$/);
  if (propsText) {
    try {
      const props = JSON.parse(propsText) as { legend?: string; input?: string; output?: string };
      const parts = [props.legend, props.input ? `## Input\n\n${props.input}` : "", props.output ? `## Output\n\n${props.output}` : ""].filter(Boolean);
      if (parts.length) statementMd = parts.join("\n\n");
    } catch {
      warnings.push("Found problem-properties.json but could not parse it as JSON.");
    }
  } else {
    const texText = textOf(entries, /statements\/.*\.tex$/);
    if (texText) {
      const converted = convertLatexToMarkdown(texText);
      statementMd = converted.markdown;
      warnings.push(...converted.warnings);
    } else {
      warnings.push("No statement found (problem-properties.json or .tex) — imported as a placeholder.");
    }
  }

  // Tests: tests/NN and tests/NN.a — Polygon's own convention, distinct
  // from testdata.ts's uploaded-zip patterns.
  const testInputs = entries.filter((e) => /^tests\/\d+$/.test(e.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  const cases: ImportedCase[] = [];
  for (const input of testInputs) {
    const num = input.path.split("/").pop()!;
    const answer = findEntry(entries, new RegExp(`^tests/${num}\\.a$`));
    if (!answer) {
      warnings.push(`tests/${num} has no matching tests/${num}.a — skipped.`);
      continue;
    }
    cases.push({
      input: input.buffer.toString("utf8"),
      output: answer.buffer.toString("utf8"),
      sample: Number(num) <= 2,
    });
  }
  if (cases.length === 0) {
    return { item: shortName, ok: false, message: "No usable tests/NN + tests/NN.a pairs found in the archive.", warnings };
  }

  // Checker: files/check.* — recorded as a warning since only C reference
  // solutions are auto-verified today (matches runPublishGate's own rule).
  const checker = findEntry(entries, /files\/check\.(cpp|c|pas)$/);
  if (checker) {
    warnings.push(`Custom checker (${checker.path}) found but not imported — checkerType stays TOKEN; verify manually.`);
  }

  // Solutions: solutions/*, tagged by directory/filename convention.
  const references: ImportedReference[] = [];
  const solutionEntries = entries.filter((e) => /^solutions\//.test(e.path) && /\.(c|cpp|cc)$/.test(e.path));
  for (const sol of solutionEntries) {
    const base = sol.path.split("/").pop()!.toLowerCase();
    const tag = Object.keys(VERDICT_TAGS).find((t) => base.includes(t)) ?? "main";
    const language = /\.(cpp|cc)$/.test(base) ? "cpp" : "c";
    if (language !== "c") {
      warnings.push(`Reference solution ${sol.path} is C++ — imported but not auto-verified (only C runs today).`);
    }
    references.push({ language, source: sol.buffer.toString("utf8"), expectedVerdict: VERDICT_TAGS[tag] });
  }
  if (references.length === 0) {
    warnings.push("No reference solutions found under solutions/ — the publish gate will block until one is added.");
  }

  const slug = `${opts.slugPrefix}-${shortName}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");

  try {
    const committed = await commitImportedProblem({
      authorId: opts.authorId,
      institutionId: opts.institutionId,
      title,
      slug,
      statementMd,
      // Polygon carries no portable difficulty label — default to MEDIUM;
      // the teacher adjusts after review.
      difficulty: "MEDIUM",
      timeLimitMs,
      memoryLimitMb,
      cases,
      references,
      source: "Polygon package",
    });
    if (!committed.gatePassed) warnings.push(...committed.gateBlockers.map((b) => `Publish gate: ${b}`));
    return {
      item: shortName,
      ok: true,
      problemId: committed.problemId,
      slug: committed.slug,
      warnings,
      message: committed.gatePassed ? "Imported and passes the publish gate." : "Imported as a draft — publish gate did not pass yet.",
    };
  } catch (err) {
    return { item: shortName, ok: false, message: err instanceof Error ? err.message : String(err), warnings };
  }
}
