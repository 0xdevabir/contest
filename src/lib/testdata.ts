import { Readable } from "stream";
import unzipper from "unzipper";
import { ValidationError } from "./errors";
import { getBlobStore, sha256 } from "./blob";

export const MAX_CASES = 200;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const INLINE_MAX_BYTES = 4 * 1024;

export type ParsedCase = {
  label: string;
  input: Buffer;
  expected: Buffer;
};

export type ZipValidationError = { file: string; message: string };

export type ParseZipResult =
  /** Hard stop — archive-level limits exceeded, nothing was parsed. */
  | { ok: false; fatal: true; errors: ZipValidationError[] }
  /** Per-file validation ran to completion. `cases` holds every valid,
   * successfully-paired case; `errors` holds the rest. The caller decides
   * whether to import the valid remainder (spec: "imports the valid
   * remainder only on explicit confirmation") or block entirely when
   * `errors.length > 0` and the request wasn't confirmed. */
  | { ok: true; cases: ParsedCase[]; errors: ZipValidationError[] };

type RawEntry = { path: string; buffer: Buffer };

/**
 * Normalises line endings to `\n` and ensures inputs end with exactly one
 * trailing newline — matches judge.ts's own stdin-newline handling so
 * imported/uploaded test data behaves identically to hand-typed input.
 */
function normalizeLineEndings(buf: Buffer, ensureTrailingNewline: boolean): Buffer {
  let text = buf.toString("utf8").replace(/\r\n/g, "\n");
  if (ensureTrailingNewline && text.length > 0 && !text.endsWith("\n")) {
    text += "\n";
  }
  return Buffer.from(text, "utf8");
}

/** Rejects any entry that could escape the extraction root (zip-slip). */
function isPathSafe(entryPath: string): boolean {
  if (!entryPath || entryPath.startsWith("/") || entryPath.startsWith("\\")) return false;
  if (entryPath.includes("..")) return false;
  if (/^[a-zA-Z]:/.test(entryPath)) return false; // Windows drive-letter absolute path
  return true;
}

/**
 * Detects one of three naming conventions from the set of basenames present,
 * without configuration: `1.in`/`1.out`, `01.in`/`01.a`, or
 * `input1.txt`/`output1.txt`. Returns pairs keyed by a stable label.
 */
function pairEntries(entries: RawEntry[]): { pairs: Map<string, { input?: RawEntry; expected?: RawEntry }>; unmatched: string[] } {
  const pairs = new Map<string, { input?: RawEntry; expected?: RawEntry }>();
  const unmatched: string[] = [];

  const patterns: { input: RegExp; output: RegExp }[] = [
    // 1.in / 1.out
    { input: /^(.*?)(\d+)\.in$/i, output: /^(.*?)(\d+)\.out$/i },
    // 01.in / 01.a  (a === "answer", a common judge convention)
    { input: /^(.*?)(\d+)\.in$/i, output: /^(.*?)(\d+)\.a$/i },
    // input1.txt / output1.txt
    { input: /^input(\d+)\.txt$/i, output: /^output(\d+)\.txt$/i },
  ];

  for (const entry of entries) {
    const base = entry.path.split("/").pop()!;
    let matched = false;

    for (const { input, output } of patterns) {
      const inMatch = base.match(input);
      if (inMatch) {
        const num = inMatch[inMatch.length - 1];
        const key = `n${num.padStart(6, "0")}`;
        const slot = pairs.get(key) ?? {};
        slot.input = entry;
        pairs.set(key, slot);
        matched = true;
        break;
      }
      const outMatch = base.match(output);
      if (outMatch) {
        const num = outMatch[outMatch.length - 1];
        const key = `n${num.padStart(6, "0")}`;
        const slot = pairs.get(key) ?? {};
        slot.expected = slot.expected ?? entry;
        pairs.set(key, slot);
        matched = true;
        break;
      }
    }

    if (!matched) unmatched.push(entry.path);
  }

  return { pairs, unmatched };
}

/**
 * Streams a zip archive, enforcing size/count caps as entries arrive rather
 * than after buffering the whole file — a 300 MB malicious zip is rejected
 * partway through, not after being fully read into memory.
 */
export async function parseTestDataZip(zipBuffer: Buffer): Promise<ParseZipResult> {
  if (zipBuffer.length > MAX_TOTAL_BYTES) {
    return { ok: false, fatal: true, errors: [{ file: "(archive)", message: `Archive exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB.` }] };
  }

  const entries: RawEntry[] = [];
  const errors: ZipValidationError[] = [];
  let totalBytes = 0;

  const source = Readable.from(zipBuffer);
  const zip = source.pipe(unzipper.Parse({ forceStream: true }));

  for await (const entry of zip as AsyncIterable<unzipper.Entry>) {
    const entryPath = entry.path;
    const type = entry.type;

    if (type !== "File") {
      entry.autodrain();
      continue;
    }
    if (!isPathSafe(entryPath)) {
      errors.push({ file: entryPath, message: "Unsafe path (zip-slip rejected)." });
      entry.autodrain();
      continue;
    }
    // Skip macOS/archiver metadata noise rather than erroring on it.
    const base = entryPath.split("/").pop()!;
    if (base.startsWith(".") || entryPath.includes("__MACOSX/")) {
      entry.autodrain();
      continue;
    }

    const chunks: Buffer[] = [];
    let bytes = 0;
    let tooLarge = false;
    for await (const chunk of entry as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      totalBytes += chunk.length;
      if (bytes > MAX_FILE_BYTES) {
        tooLarge = true;
        continue;
      }
      if (totalBytes > MAX_TOTAL_BYTES) {
        return { ok: false, fatal: true, errors: [{ file: entryPath, message: `Archive exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB total.` }] };
      }
      chunks.push(chunk);
    }

    if (tooLarge) {
      errors.push({ file: entryPath, message: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB.` });
      continue;
    }

    entries.push({ path: entryPath, buffer: Buffer.concat(chunks) });
  }

  const { pairs, unmatched } = pairEntries(entries);

  for (const path of unmatched) {
    errors.push({ file: path, message: "Unrecognised file — no matching input/output pair." });
  }

  const cases: ParsedCase[] = [];
  let index = 1;
  for (const [key, slot] of [...pairs.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!slot.input || !slot.expected) {
      const missing = !slot.input ? "input" : "expected output";
      const present = slot.input?.path ?? slot.expected?.path ?? key;
      errors.push({ file: present, message: `Missing paired ${missing} file.` });
      continue;
    }
    cases.push({
      label: String(index),
      input: normalizeLineEndings(slot.input.buffer, true),
      expected: normalizeLineEndings(slot.expected.buffer, false),
    });
    index++;
  }

  if (cases.length > MAX_CASES) {
    return {
      ok: false,
      fatal: true,
      errors: [{ file: "(archive)", message: `Archive has ${cases.length} cases, max is ${MAX_CASES}.` }],
    };
  }

  return { ok: true, cases, errors };
}

/**
 * Persists a parsed case's input/expected to the blob store, inlining
 * content under INLINE_MAX_BYTES (D2's "small-test fast path") and
 * deduping identical content by hash — a shared sample input across many
 * problems, or a resubmitted upload of the same data, is stored once.
 */
export async function storeCaseBlob(
  problemId: string,
  versionId: string,
  caseIndex: number,
  kind: "in" | "out",
  content: Buffer
): Promise<{ key: string | null; inline: string | null; hash: string; bytes: number }> {
  const hash = sha256(content);
  if (content.length <= INLINE_MAX_BYTES) {
    return { key: null, inline: content.toString("utf8"), hash, bytes: content.length };
  }
  const store = getBlobStore();
  const key = `tests/${problemId}/${versionId}/${hash}.${kind}`;
  if (!(await store.exists(key))) {
    await store.put(key, content, { contentType: "text/plain" });
  }
  return { key, inline: null, hash, bytes: content.length };
}

export function validateCaseCount(count: number): void {
  if (count > MAX_CASES) {
    throw new ValidationError(`Too many test cases (${count}); max is ${MAX_CASES}.`);
  }
}
