import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { TokenType } from "@prisma/client";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function rawToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthToken(
  userId: string,
  type: TokenType,
  ttlMs: number
) {
  const token = rawToken();
  const hashed = hashToken(token);
  await prisma.authToken.deleteMany({ where: { userId, type } });
  await prisma.authToken.create({
    data: {
      userId,
      type,
      token: hashed,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return token;
}

export async function consumeAuthToken(token: string, type: TokenType) {
  const hashed = hashToken(token);
  const row = await prisma.authToken.findUnique({ where: { token: hashed } });
  if (!row || row.type !== type) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.authToken.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }
  await prisma.authToken.delete({ where: { id: row.id } });
  return row.userId;
}
