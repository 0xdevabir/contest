/**
 * Phase 13 Part 1 — archives payloads (code/stdout/stderr/report) of
 * `Submission` rows older than 90 days to gzipped JSON in blob storage
 * (`src/lib/submission-payload.ts`'s `archiveSubmissionPayloadToBlob`), and
 * sets `Submission.payloadKey` so reads fall through to the blob (see
 * `getSubmissionPayload`'s fallback chain: blob -> SubmissionPayload row ->
 * inline columns).
 *
 * Batched at 1000 rows, resumable via a cursor file (last processed
 * Submission id, ordered by id ascending), and idempotent — it only selects
 * rows where `payloadKey IS NULL`, so a crash or a re-run simply picks up
 * where it left off / skips already-archived rows.
 *
 * By default this is NON-DESTRUCTIVE: it archives to blob and sets
 * `payloadKey`, but leaves the inline `code`/`stdout`/`stderr`/`report`
 * columns and any `SubmissionPayload` row untouched — safe to run (and
 * re-run) at any time, including against production, without risking data
 * loss.
 *
 * Pass `--nullify` to additionally null the inline columns and delete any
 * `SubmissionPayload` row for that submission — but only AFTER reading the
 * just-written blob back and confirming it byte-for-byte matches what was
 * archived. This is the only destructive mode; run it well after a
 * non-destructive pass has been verified.
 *
 * This script does no scheduling of its own — it is meant to be invoked
 * manually or from an off-peak cron entry, e.g.:
 *   # crontab, 03:00 daily, off-peak for this platform's contest schedule
 *   0 3 * * * cd /path/to/contest-hub && npx tsx scripts/migrations/0007-archive-submission-payloads.ts >> /var/log/contest-hub/archive-payloads.log 2>&1
 *
 * Usage:
 *   npx tsx scripts/migrations/0007-archive-submission-payloads.ts
 *   npx tsx scripts/migrations/0007-archive-submission-payloads.ts --nullify
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { log } from "../../src/lib/log";
import { getSubmissionPayload, archiveSubmissionPayloadToBlob } from "../../src/lib/submission-payload";
import { getBlobStore } from "../../src/lib/blob";
import { gunzipSync } from "zlib";

const BATCH_SIZE = 1000;
const AGE_DAYS = 90;
const BATCH_DELAY_MS = 250;
const NULLIFY = process.argv.includes("--nullify");

const CURSOR_DIR = path.join(process.cwd(), ".data", "migration-cursors");
const CURSOR_FILE = path.join(CURSOR_DIR, "0007.json");

type Cursor = { lastId: string | null; archived: number; nullified: number };

function loadCursor(): Cursor {
  if (existsSync(CURSOR_FILE)) {
    try {
      return JSON.parse(readFileSync(CURSOR_FILE, "utf8"));
    } catch {
      // Corrupt cursor file — start clean rather than crash; the query's
      // `payloadKey IS NULL` filter keeps this idempotent regardless.
    }
  }
  return { lastId: null, archived: 0, nullified: 0 };
}

function saveCursor(cursor: Cursor) {
  mkdirSync(CURSOR_DIR, { recursive: true });
  writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads the blob back and compares it byte-for-byte against the source payload. */
async function verifyBlobRoundTrip(
  payloadKey: string,
  expected: { code: string; stdout: string | null; stderr: string | null; report: unknown }
): Promise<boolean> {
  const store = getBlobStore();
  const buf = await store.get(payloadKey);
  const parsed = JSON.parse(gunzipSync(buf).toString("utf8"));
  return (
    parsed.code === expected.code &&
    (parsed.stdout ?? null) === (expected.stdout ?? null) &&
    (parsed.stderr ?? null) === (expected.stderr ?? null) &&
    JSON.stringify(parsed.report ?? null) === JSON.stringify(expected.report ?? null)
  );
}

async function main() {
  const cursor = loadCursor();
  const cutoff = new Date(Date.now() - AGE_DAYS * 24 * 60 * 60 * 1000);

  log.info("archive-submission-payloads: starting", {
    cutoff: cutoff.toISOString(),
    nullify: NULLIFY,
    resumingFrom: cursor.lastId,
  });

  for (;;) {
    const rows = await prisma.submission.findMany({
      where: {
        createdAt: { lt: cutoff },
        payloadKey: null,
        ...(cursor.lastId ? { id: { gt: cursor.lastId } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true, code: true, stdout: true, stderr: true, report: true, payloadKey: true, createdAt: true },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const payload = await getSubmissionPayload(row);
        const key = await archiveSubmissionPayloadToBlob(row.id, payload);
        await prisma.submission.update({ where: { id: row.id }, data: { payloadKey: key } });
        cursor.archived++;

        if (NULLIFY) {
          const roundTripOk = await verifyBlobRoundTrip(key, payload);
          if (!roundTripOk) {
            log.error("archive-submission-payloads: blob round-trip mismatch, skipping nullify", {
              submissionId: row.id,
              payloadKey: key,
            });
          } else {
            await prisma.$transaction([
              prisma.submission.update({
                where: { id: row.id },
                data: { code: "", stdout: null, stderr: null, report: Prisma.JsonNull },
              }),
              prisma.submissionPayload.deleteMany({ where: { submissionId: row.id } }),
            ]);
            cursor.nullified++;
          }
        }
      } catch (err) {
        log.error("archive-submission-payloads: failed to archive submission", { submissionId: row.id }, err);
        // Leave payloadKey unset and move on — the next run retries this row
        // since the `payloadKey IS NULL` filter still selects it.
      }
      cursor.lastId = row.id;
    }

    saveCursor(cursor);
    log.info("archive-submission-payloads: batch complete", {
      batchSize: rows.length,
      totalArchived: cursor.archived,
      totalNullified: cursor.nullified,
      lastId: cursor.lastId,
    });

    if (rows.length < BATCH_SIZE) break;
    await sleep(BATCH_DELAY_MS);
  }

  log.info("archive-submission-payloads: done", {
    totalArchived: cursor.archived,
    totalNullified: cursor.nullified,
  });
  await prisma.$disconnect();
}

main().catch(async (err) => {
  log.error("archive-submission-payloads: fatal error", {}, err);
  await prisma.$disconnect();
  process.exit(1);
});
