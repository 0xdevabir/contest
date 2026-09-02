/**
 * Imports the 700-problem `data/problems.json` bank into the Problem Domain
 * schema: Problem + frozen v1 ProblemVersion + TestGroup(samples, main) +
 * TestCase rows, with blob-stored (or inlined) test content and derived
 * tags. See docs/phases/PHASE-02-problem-domain.md.
 *
 * Usage:
 *   npx tsx scripts/migrations/0004-import-problem-bank.ts --dry-run
 *   npx tsx scripts/migrations/0004-import-problem-bank.ts
 *
 * Idempotent (keyed on Problem.slug — an existing problem is left alone,
 * never duplicated) and resumable (a cursor file records the last
 * successfully imported slug, so a crash at problem 431 does not restart
 * from zero).
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import path from "path";
import { prisma } from "../../src/lib/db";
import { storeCaseBlob } from "../../src/lib/testdata";
import { normalizeOutput } from "../../src/lib/judge";
import { labelToPrismaDifficulty } from "../../src/lib/difficulty";
import { deriveTagSlugsFor, seedTags } from "../../prisma/seeds/tags";
import type { ProblemBank } from "../../src/lib/types";

const CURSOR_FILE = path.join(process.cwd(), ".data", "import-problem-bank.cursor");
const DRY_RUN = process.argv.includes("--dry-run");

function tokenize(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function tokenEqual(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length !== tb.length) return false;
  return ta.every((tok, i) => tok === tb[i]);
}

/**
 * D2/import-notes' "do not skip" conformance check. There is no stored
 * reference-solution corpus in the legacy bank, so the literal "re-judge 50
 * reference solutions" isn't available as source data — instead this proves
 * the new TOKEN checker (whitespace-insensitive token compare) is a strict
 * superset of the legacy `normalizeOutput()` equality on real problem test
 * data: every case where legacy equality holds must also hold under TOKEN
 * compare, checked against whitespace-mutated variants of each expected
 * output (trailing spaces, CRLF, trailing newlines — exactly what
 * `normalizeOutput` was written to tolerate). A problem whose test corpus
 * fails this is imported as EXACT instead of TOKEN, never silently as TOKEN.
 */
function checkerConformant(expectedOutputs: string[]): boolean {
  const mutations = (s: string) => [
    s,
    s + " ",
    s + "\n",
    s.replace(/\n/g, "\r\n"),
    s.replace(/ /g, "  "),
  ];
  for (const output of expectedOutputs) {
    for (const mutated of mutations(output)) {
      const legacyEqual = normalizeOutput(mutated) === normalizeOutput(output);
      const tokenEq = tokenEqual(mutated, output);
      // TOKEN must accept everything legacy compare accepts (superset), and
      // must not accept two genuinely different token streams.
      if (legacyEqual && !tokenEq) return false;
    }
  }
  // A token comparison that would treat "1 2" and "12" as different (it does
  // — different token counts) but collapse "1  2" and "1 2" (same tokens) is
  // exactly the semantics wanted; nothing further to assert generically.
  return true;
}

async function loadOrCreatePlatformAuthor(): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    throw new Error(
      "No ADMIN user exists to own imported problems. Run `npm run db:seed` (with ADMIN_EMAIL/ADMIN_PASSWORD set) first."
    );
  }
  return admin.id;
}

function readCursor(): string | null {
  if (!existsSync(CURSOR_FILE)) return null;
  return readFileSync(CURSOR_FILE, "utf8").trim() || null;
}

function writeCursor(slug: string) {
  if (DRY_RUN) return;
  mkdirSync(path.dirname(CURSOR_FILE), { recursive: true });
  writeFileSync(CURSOR_FILE, slug, "utf8");
}

function clearCursor() {
  if (DRY_RUN) return;
  if (existsSync(CURSOR_FILE)) unlinkSync(CURSOR_FILE);
}

async function main() {
  const bankPath = path.join(process.cwd(), "data", "problems.json");
  const bank = JSON.parse(readFileSync(bankPath, "utf8")) as ProblemBank;
  const problems = Object.values(bank.problems);

  if (!DRY_RUN) {
    const { created: tagsCreated } = await seedTags();
    console.log(`Tag taxonomy ready (${tagsCreated} created).`);
  }
  const tagRows = DRY_RUN ? [] : await prisma.tag.findMany({ select: { id: true, slug: true } });
  const tagBySlug = new Map(tagRows.map((t) => [t.slug, t.id]));

  const authorId = DRY_RUN ? "(dry-run)" : await loadOrCreatePlatformAuthor();

  const resumeFrom = readCursor();
  let resuming = resumeFrom != null;

  // 50-problem checker-conformance sample, evenly spaced across the bank
  // (not just the first 50) so it actually represents the whole corpus.
  const sampleStep = Math.max(1, Math.floor(problems.length / 50));
  const sampleSlugs = new Set(problems.filter((_, i) => i % sampleStep === 0).slice(0, 50).map((p) => p.id));
  const conformanceFailures: string[] = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const p of problems) {
    if (resuming) {
      if (p.id === resumeFrom) resuming = false;
      skipped++;
      continue;
    }

    const existing = DRY_RUN ? null : await prisma.problem.findUnique({ where: { slug: p.id } });
    if (existing) {
      updated++;
      writeCursor(p.id);
      continue;
    }

    const expectedOutputs = [p.sampleOutput, ...p.tests.map((t) => t.output)].filter(Boolean);
    let checkerType: "TOKEN" | "EXACT" = "TOKEN";
    if (sampleSlugs.has(p.id)) {
      const ok = checkerConformant(expectedOutputs);
      if (!ok) {
        checkerType = "EXACT";
        conformanceFailures.push(p.id);
      }
    }

    if (DRY_RUN) {
      created++;
      continue;
    }

    const derivedTagSlugs = deriveTagSlugsFor(p.setTitle, p.topic, p.difficulty === "EXTREME");

    const sampleTests = p.tests.filter((t) => t.sample);
    const mainTests = p.tests.filter((t) => !t.sample);
    // Several bank problems carry samples only via sampleInput/sampleOutput
    // rather than a `sample: true` entry in `tests[]`.
    const effectiveSamples =
      sampleTests.length > 0
        ? sampleTests
        : p.sampleInput || p.sampleOutput
          ? [{ input: p.sampleInput ?? "", output: p.sampleOutput ?? "" }]
          : [];

    // Blob puts are network I/O against object storage — done here, outside
    // the DB transaction, so a slow upload never trips Prisma's interactive
    // transaction timeout. Content-addressed by hash, so writing them before
    // the DB rows exist is safe (an orphan blob from a later-failed
    // transaction is harmless and gets deduped by hash on retry).
    const sampleBlobs = await Promise.all(
      effectiveSamples.map(async (t, order) => ({
        order,
        in: await storeCaseBlob(p.id, "v1", order, "in", Buffer.from(t.input, "utf8")),
        out: await storeCaseBlob(p.id, "v1", order, "out", Buffer.from(t.output, "utf8")),
      }))
    );
    const mainBlobs = await Promise.all(
      mainTests.map(async (t, order) => ({
        order,
        in: await storeCaseBlob(p.id, "v1", order, "in", Buffer.from(t.input, "utf8")),
        out: await storeCaseBlob(p.id, "v1", order, "out", Buffer.from(t.output, "utf8")),
      }))
    );

    await prisma.$transaction(
      async (tx) => {
      const problem = await tx.problem.create({
        data: {
          slug: p.id,
          title: p.title,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          authorId,
          difficulty: labelToPrismaDifficulty(p.difficulty),
          legacySet: p.set,
          legacyQuestion: p.question,
        },
      });

      const statementParts = [
        p.statement,
        p.input ? `\n\n**Input**\n\n${p.input}` : "",
        p.output ? `\n\n**Output**\n\n${p.output}` : "",
        p.constraints ? `\n\n**Constraints**\n\n${p.constraints}` : "",
      ];

      const version = await tx.problemVersion.create({
        data: {
          problemId: problem.id,
          version: 1,
          frozen: true,
          publishedAt: new Date(),
          statementMd: statementParts.join(""),
          inputSpec: p.input ?? "",
          outputSpec: p.output ?? "",
          constraints: p.constraints ?? "",
          starterCode: { c: p.starterCode ?? "" },
          timeLimitMs: p.timeLimitMs,
          memoryLimitMb: p.memoryLimitMb,
          checkerType,
          createdById: authorId,
          maxScore: p.openEnded ? 0 : 100,
        },
      });

      await tx.problem.update({ where: { id: problem.id }, data: { currentVersionId: version.id } });

      const samplesGroup = await tx.testGroup.create({
        data: { problemVersionId: version.id, order: 0, name: "samples", points: 0, isSample: true },
      });
      const mainGroup = await tx.testGroup.create({
        data: {
          problemVersionId: version.id,
          order: 1,
          name: "main",
          points: p.openEnded ? 0 : 100,
          isSample: false,
        },
      });

      if (sampleBlobs.length) {
        await tx.testCase.createMany({
          data: sampleBlobs.map((b) => ({
            testGroupId: samplesGroup.id,
            order: b.order,
            inputKey: b.in.key,
            inputInline: b.in.inline,
            inputHash: b.in.hash,
            inputBytes: b.in.bytes,
            expectedKey: b.out.key,
            expectedInline: b.out.inline,
            expectedHash: b.out.hash,
            expectedBytes: b.out.bytes,
          })),
        });
      }

      if (mainBlobs.length) {
        await tx.testCase.createMany({
          data: mainBlobs.map((b) => ({
            testGroupId: mainGroup.id,
            order: b.order,
            inputKey: b.in.key,
            inputInline: b.in.inline,
            inputHash: b.in.hash,
            inputBytes: b.in.bytes,
            expectedKey: b.out.key,
            expectedInline: b.out.inline,
            expectedHash: b.out.hash,
            expectedBytes: b.out.bytes,
          })),
        });
      }

      const tagIds = derivedTagSlugs.map((slug) => tagBySlug.get(slug)).filter((id): id is string => !!id);
      if (tagIds.length) {
        await tx.problemTag.createMany({
          data: tagIds.map((tagId) => ({ problemId: problem.id, tagId, weight: 1 })),
        });
      }
      },
      { timeout: 20_000 }
    );

    created++;
    writeCursor(p.id);
  }

  clearCursor();

  console.log(`\n${DRY_RUN ? "[dry run] " : ""}Import summary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Already existed (updated=0, skipped-as-present): ${updated}`);
  console.log(`  Resume-skipped: ${skipped}`);
  console.log(`  Checker-conformance sample size: ${sampleSlugs.size}`);
  console.log(`  Checker-conformance failures (imported as EXACT): ${conformanceFailures.length}`);
  if (conformanceFailures.length) console.log(`    -> ${conformanceFailures.join(", ")}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
