import { randomBytes, randomInt, createHash, timingSafeEqual } from "crypto";
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

export function passwordResetCode() {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
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

export async function createPasswordResetCode(userId: string) {
  const code = passwordResetCode();
  const hashed = hashToken(`${userId}:${code}`);
  await prisma.authToken.deleteMany({
    where: { userId, type: "PASSWORD_RESET" },
  });
  await prisma.authToken.create({
    data: {
      userId,
      type: "PASSWORD_RESET",
      token: hashed,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10),
    },
  });
  return code;
}

export async function consumePasswordResetCode(userId: string, code: string) {
  const row = await prisma.authToken.findFirst({
    where: { userId, type: "PASSWORD_RESET" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.authToken.delete({ where: { id: row.id } }).catch(() => undefined);
    return false;
  }

  const expected = Buffer.from(row.token, "hex");
  const actual = Buffer.from(hashToken(`${userId}:${code}`), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }

  await prisma.authToken.delete({ where: { id: row.id } });
  return true;
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

