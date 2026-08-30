import { execSync } from "node:child_process";
import { beforeAll, afterAll, afterEach } from "vitest";

/**
 * DB resolution order for the integration tier:
 *   1. TEST_DATABASE_URL (CI's Postgres service container)
 *   2. A Neon branch, if NEON_API_KEY + NEON_PROJECT_ID are set
 *   3. Skip — contributors without a database still get the unit tier
 *
 * `hasTestDb` lets integration test files early-`describe.skipIf`.
 */
export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

if (hasTestDb) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}

let prismaModule: typeof import("@/lib/db") | undefined;

beforeAll(async () => {
  if (!hasTestDb) return;
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env },
  });
  prismaModule = await import("@/lib/db");
});

/**
 * Deletes all rows in FK-safe order. Not a transaction rollback: several
 * routes under test call `prisma.$transaction` internally, and Prisma's
 * transactional client cannot itself be nested inside an outer test
 * transaction. A per-test delete sweep is slower but correct for every route.
 */
export async function resetDb(): Promise<void> {
  if (!prismaModule) return;
  const { prisma } = prismaModule;
  await prisma.$transaction([
    prisma.submission.deleteMany(),
    prisma.solvedProblem.deleteMany(),
    prisma.contestRegistration.deleteMany(),
    prisma.contestProblem.deleteMany(),
    prisma.contest.deleteMany(),
    prisma.adminAuditLog.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.featureFlag.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

afterEach(async () => {
  if (hasTestDb) await resetDb();
});

afterAll(async () => {
  if (!prismaModule) return;
  await prismaModule.prisma.$disconnect();
});
