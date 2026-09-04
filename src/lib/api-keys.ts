import { randomBytes, createHash } from "crypto";
import { prisma } from "./db";
import { AuthError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import type { SessionUser } from "./auth";

/**
 * D2 (docs/phases/PHASE-12-platform-api.md) — every /api/v1 scope. A key is
 * created with a subset and can never exceed what its owner could do
 * themselves (checked separately, per-route, against the owner's role).
 */
export const API_SCOPES = [
  "problems:read",
  "problems:write",
  "contests:read",
  "contests:write",
  "standings:read",
  "submissions:read",
  "submissions:write",
  "sections:read",
  "sections:write",
  "users:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(v: string): v is ApiScope {
  return (API_SCOPES as readonly string[]).includes(v);
}

const DEFAULT_RATE_LIMIT = 60;

function env(): "live" | "test" {
  return process.env.NODE_ENV === "production" ? "live" : "test";
}

/** SHA-256, not bcrypt — these are high-entropy random tokens verified on
 * every request, so a slow hash is a self-inflicted DoS (D2). */
function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mints a new raw token, shown to the caller exactly once. Prefixed
 * `chk_live_`/`chk_test_` so a leaked key is identifiable in logs and by
 * secret scanners.
 */
function mintToken(): { raw: string; prefix: string; hash: string } {
  const body = randomBytes(24).toString("base64url");
  const raw = `chk_${env()}_${body}`;
  const prefix = raw.slice(0, raw.indexOf("_", raw.indexOf("_") + 1) + 9);
  return { raw, prefix, hash: hashKey(raw) };
}

export type CreateApiKeyInput = {
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
};

export async function createApiKey(userId: string, input: CreateApiKeyInput) {
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new ValidationError("A key name is required.");
  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0) throw new ValidationError("Select at least one scope.");
  for (const s of scopes) {
    if (!isApiScope(s)) throw new ValidationError(`Unknown scope: ${s}`);
  }

  const { raw, prefix, hash } = mintToken();
  const key = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      scopes,
      rateLimit: DEFAULT_RATE_LIMIT,
      expiresAt: input.expiresAt ?? null,
    },
  });

  // The raw token is returned once and never persisted or logged again.
  return { key, rawToken: raw };
}

export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

async function requireOwnedKey(keyId: string, actor: SessionUser) {
  const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!key) throw new NotFoundError("API key not found");
  if (key.userId !== actor.id && actor.role !== "ADMIN") throw new ForbiddenError();
  return key;
}

export async function revokeApiKey(keyId: string, actor: SessionUser) {
  const key = await requireOwnedKey(keyId, actor);
  if (key.revokedAt) return key;
  return prisma.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
}

/** Revokes the old key and mints a fresh one with the same name/scopes —
 * the UI's "rotate" action; the old raw token stops working immediately. */
export async function rotateApiKey(keyId: string, actor: SessionUser) {
  const key = await requireOwnedKey(keyId, actor);
  await prisma.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
  return createApiKey(key.userId, { name: key.name, scopes: key.scopes, expiresAt: key.expiresAt });
}

export async function setApiKeyRateLimit(keyId: string, actor: SessionUser, rateLimit: number) {
  await requireOwnedKey(keyId, actor);
  if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 10_000) {
    throw new ValidationError("rateLimit must be an integer between 1 and 10000.");
  }
  if (actor.role !== "ADMIN") throw new ForbiddenError("Only an admin can change a key's rate limit.");
  return prisma.apiKey.update({ where: { id: keyId }, data: { rateLimit } });
}

export type AuthenticatedKey = {
  id: string;
  userId: string;
  scopes: ApiScope[];
  rateLimit: number;
  owner: SessionUser;
};

/**
 * Verifies a raw `Authorization: Bearer <token>` value against the stored
 * hash, rejects expired/revoked keys, and stamps `lastUsedAt`. Returns the
 * key's owner as a full SessionUser so route handlers can reuse the same
 * authz checks (`can`/`assertCan`) they already use for cookie sessions —
 * a key can never exceed what its owner could do themselves.
 */
export async function authenticateApiKey(rawToken: string): Promise<AuthenticatedKey> {
  if (!rawToken.startsWith("chk_")) throw new AuthError("Invalid API key.");
  const hash = hashKey(rawToken);
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash }, include: { user: true } });
  if (!key) throw new AuthError("Invalid API key.");
  if (key.revokedAt) throw new AuthError("This API key has been revoked.");
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) throw new AuthError("This API key has expired.");
  if (key.user.status !== "ACTIVE") throw new AuthError("This account is suspended.");

  // Best-effort — a failed stamp must never block the request it's tracking.
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

  const owner: SessionUser = {
    id: key.user.id,
    email: key.user.email,
    name: key.user.name,
    role: key.user.role,
    institutionId: key.user.institutionId,
    institutionVerifiedAt: key.user.institutionVerifiedAt,
    teacherApprovedAt: key.user.teacherApprovedAt,
    emailVerified: Boolean(key.user.emailVerified),
    theme: "dark",
  };

  return {
    id: key.id,
    userId: key.userId,
    scopes: key.scopes.filter(isApiScope),
    rateLimit: key.rateLimit,
    owner,
  };
}

export function requireScope(key: AuthenticatedKey, scope: ApiScope): void {
  if (!key.scopes.includes(scope)) {
    throw new ForbiddenError(`This API key does not have the "${scope}" scope.`);
  }
}
