import { gunzipSync, gzipSync } from "zlib";
import { prisma } from "./db";
import { getBlobStore } from "./blob";
import { isEnabled } from "./flags";
import { log } from "./log";

/**
 * Phase 13 Part 1 — Submission payload offload (expand step).
 *
 * `Submission` keeps its inline `code`/`stdout`/`stderr`/`report` columns
 * (the contract migration that drops them is a manual, human-triggered step —
 * see docs/phases/PHASE-13-scale-ops.md). This module is the read/write
 * indirection so callers never need to know whether a given submission's
 * payload lives inline, in `SubmissionPayload`, or archived to blob storage.
 */

export type SubmissionPayloadFields = {
  code: string;
  stdout: string | null;
  stderr: string | null;
  report: unknown;
};

type SubmissionLike = SubmissionPayloadFields & {
  id: string;
  payloadKey: string | null;
};

/** Payloads at or above this size move to SubmissionPayload instead of inline columns. */
const OFFLOAD_THRESHOLD_BYTES = 4096;

function blobKeyFor(submissionId: string): string {
  return `submission-payloads/${submissionId}.json.gz`;
}

/**
 * Reads a submission's payload, following the fallback chain:
 * blob storage (payloadKey set) -> SubmissionPayload row -> inline columns.
 * Never throws on a missing blob/row — falls through so a partially-migrated
 * dataset (or a failed archive job) degrades to "the miss path", not a 500.
 */
export async function getSubmissionPayload(submission: SubmissionLike): Promise<SubmissionPayloadFields> {
  if (submission.payloadKey) {
    try {
      const store = getBlobStore();
      const buf = await store.get(submission.payloadKey);
      const json = JSON.parse(gunzipSync(buf).toString("utf8"));
      return {
        code: json.code ?? "",
        stdout: json.stdout ?? null,
        stderr: json.stderr ?? null,
        report: json.report ?? null,
      };
    } catch (err) {
      log.warn("submission payload blob read failed, falling back", {
        submissionId: submission.id,
        payloadKey: submission.payloadKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const row = await prisma.submissionPayload.findUnique({ where: { submissionId: submission.id } });
  if (row) {
    return { code: row.code, stdout: row.stdout, stderr: row.stderr, report: row.report };
  }

  return {
    code: submission.code,
    stdout: submission.stdout,
    stderr: submission.stderr,
    report: submission.report,
  };
}

/**
 * Called when a submission's verdict is finalized. When `scaleOps` is on and
 * the payload is large, writes it to `SubmissionPayload` instead of leaving
 * it in the inline columns — the dual-write half of expand/backfill/contract.
 * Returns true if it offloaded (caller should null the inline columns in the
 * same write), false if the payload should stay inline as normal.
 */
export async function maybeOffloadSubmissionPayload(
  submissionId: string,
  payload: SubmissionPayloadFields
): Promise<boolean> {
  if (!(await isEnabled("scaleOps"))) return false;

  const bytes =
    Buffer.byteLength(payload.code, "utf8") + Buffer.byteLength(JSON.stringify(payload.report ?? null), "utf8");
  if (bytes < OFFLOAD_THRESHOLD_BYTES) return false;

  await prisma.submissionPayload.upsert({
    where: { submissionId },
    create: {
      submissionId,
      code: payload.code,
      stdout: payload.stdout,
      stderr: payload.stderr,
      report: payload.report as never,
    },
    update: {
      code: payload.code,
      stdout: payload.stdout,
      stderr: payload.stderr,
      report: payload.report as never,
    },
  });
  return true;
}

/**
 * Archives one submission's payload (inline or SubmissionPayload) to blob
 * storage as gzipped JSON and returns the blob key. Used by the backfill
 * script (scripts/migrations/0007-archive-submission-payloads.ts) — does not
 * touch the source rows, that's the caller's job.
 */
export async function archiveSubmissionPayloadToBlob(
  submissionId: string,
  payload: SubmissionPayloadFields
): Promise<string> {
  const store = getBlobStore();
  const key = blobKeyFor(submissionId);
  const body = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  await store.put(key, body, { contentType: "application/gzip" });
  return key;
}
