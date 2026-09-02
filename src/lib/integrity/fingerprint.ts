import { prisma } from "../db";
import { log } from "../log";
import { normalizeSource } from "./normalize";
import { fingerprintTokens } from "./winnow";

/** Below this many normalized tokens, a fingerprint is meaningless noise —
 * D2's length floor. "Read two ints, print the sum" shouldn't be compared. */
export const MIN_TOKEN_COUNT = 40;

/**
 * Computes and persists the winnowed fingerprint for one judged submission,
 * plus its inverted-index rows. Called from the judge/rejudge paths right
 * after a submission's final verdict is written (D1). Never throws — a
 * fingerprinting failure must not affect judging or the submission response.
 */
export async function fingerprintSubmission(opts: {
  submissionId: string;
  problemId: string;
  code: string;
  language: string;
}): Promise<void> {
  try {
    const tokens = normalizeSource(opts.code, opts.language);
    if (tokens.length < MIN_TOKEN_COUNT) return;

    const hashes = fingerprintTokens(tokens);
    if (hashes.length === 0) return;

    await prisma.$transaction([
      prisma.submissionFingerprint.upsert({
        where: { submissionId: opts.submissionId },
        create: {
          submissionId: opts.submissionId,
          language: opts.language,
          hashes,
          tokenCount: tokens.length,
        },
        update: { hashes, tokenCount: tokens.length, language: opts.language },
      }),
      prisma.fingerprintIndex.deleteMany({ where: { submissionId: opts.submissionId } }),
      prisma.fingerprintIndex.createMany({
        data: hashes.map((hash) => ({ hash, problemId: opts.problemId, submissionId: opts.submissionId })),
        skipDuplicates: true,
      }),
    ]);
  } catch (err) {
    log.error("fingerprinting submission failed", { submissionId: opts.submissionId }, err);
  }
}
