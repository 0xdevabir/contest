import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { prisma } from "../db";
import { ValidationError } from "../errors";

/**
 * D4 — "Actual remote submission is gated behind an explicit per-institution
 * admin opt-in with a written acknowledgement of the target site's terms,
 * and requires the user's own credentials on that site, stored encrypted
 * and revocable. Off by default."
 *
 * This module is the encrypted-storage half only. There is deliberately no
 * "submit on the user's behalf" function anywhere in this codebase —
 * vJudge's scraped-session model is what D4 explicitly refuses to
 * replicate. Storing a credential here does nothing by itself; it exists so
 * a future, explicitly-opted-in submission path has somewhere safe to read
 * from.
 */
function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  // AES-256-GCM needs a 32-byte key; derive one from whatever length secret
  // is configured rather than requiring a second env var.
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export async function saveRemoteCredential(userId: string, provider: string, handle: string, secret: string) {
  if (!handle.trim() || !secret.trim()) throw new ValidationError("Handle and secret are required.");
  const secretEnc = encryptSecret(secret);
  return prisma.remoteCredential.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, handle, secretEnc },
    update: { handle, secretEnc, verifiedAt: null },
  });
}

export async function listRemoteCredentials(userId: string) {
  const rows = await prisma.remoteCredential.findMany({ where: { userId } });
  // Never return the encrypted secret to the client — presence + handle is
  // all the UI needs to render "connected" state.
  return rows.map((r) => ({ id: r.id, provider: r.provider, handle: r.handle, verifiedAt: r.verifiedAt, createdAt: r.createdAt }));
}

export async function revokeRemoteCredential(userId: string, id: string) {
  await prisma.remoteCredential.deleteMany({ where: { id, userId } });
}
