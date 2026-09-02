import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

/**
 * D6 — "a certificate is a row plus a public verification page, not a PDF
 * someone can edit in Photoshop." `signature` is an HMAC-SHA256 over the
 * canonical (stably key-ordered) JSON payload, keyed by a server secret. The
 * verification page recomputes it from the stored payload and compares.
 */
export type CertificateType =
  | "contest_participation"
  | "contest_rank"
  | "course_completion"
  | "season_achievement"
  | "problem_milestone";

export type CertificatePayload = Record<string, string | number | boolean | null>;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required to sign certificates");
  return s;
}

/** Deterministic JSON: keys sorted so the same payload always hashes the
 * same way regardless of insertion order (Postgres JSON columns don't
 * guarantee key order is preserved on round-trip). */
export function canonicalize(payload: CertificatePayload): string {
  return JSON.stringify(
    Object.keys(payload)
      .sort()
      .reduce<CertificatePayload>((acc, key) => {
        acc[key] = payload[key];
        return acc;
      }, {})
  );
}

export function signPayload(payload: CertificatePayload): string {
  return createHmac("sha256", secret()).update(canonicalize(payload)).digest("hex");
}

/** Constant-time compare — a certificate's whole point is resisting a
 * plausible-looking forgery, so a timing side channel on verification would
 * defeat it. */
export function verifySignature(payload: CertificatePayload, signature: string): boolean {
  const expected = signPayload(payload);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function issueCertificate(opts: {
  type: CertificateType;
  userId: string;
  contestId?: string;
  sectionId?: string;
  payload: CertificatePayload;
}) {
  const signature = signPayload(opts.payload);
  return prisma.certificate.create({
    data: {
      type: opts.type,
      userId: opts.userId,
      contestId: opts.contestId,
      sectionId: opts.sectionId,
      payload: opts.payload,
      signature,
    },
  });
}

export type CertificateVerification =
  | { valid: true; certificate: NonNullable<Awaited<ReturnType<typeof getCertificate>>> }
  | { valid: false; reason: "not_found" | "revoked" | "tampered" };

async function getCertificate(id: string) {
  return prisma.certificate.findUnique({ where: { id } });
}

export async function verifyCertificate(id: string): Promise<CertificateVerification> {
  const cert = await getCertificate(id);
  if (!cert) return { valid: false, reason: "not_found" };
  if (cert.revokedAt) return { valid: false, reason: "revoked" };
  const ok = verifySignature(cert.payload as CertificatePayload, cert.signature);
  if (!ok) return { valid: false, reason: "tampered" };
  return { valid: true, certificate: cert };
}
