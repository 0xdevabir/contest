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

// Vite's config loader reads .env into process.env for every test file
// regardless of mode. A developer's real RUNNER_TOKEN/NEXT_PUBLIC_RUNNER_URL
// (or JUDGE0_URL) would otherwise make src/lib/judge.ts's compileAndJudge()
// reach out to a real external judge during the test run — never hermetic,
// and exactly what F-1/F-2's local-judge-path tests are not meant to hit.
delete process.env.NEXT_PUBLIC_RUNNER_URL;
delete process.env.RUNNER_TOKEN;
delete process.env.JUDGE0_URL;

let prismaModule: typeof import("@/lib/db") | undefined;

beforeAll(async () => {
  // Migrations run once for the whole run in tests/global-setup.ts, not here
  // — running `prisma migrate deploy` per test file was slow enough to blow
  // past the per-file hook timeout once more than a couple of files needed
  // the DB.
  if (!hasTestDb) return;
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
  // Same isolated-registry issue as $disconnect above: a file that mocks
  // "@/lib/db" gets a stub here with only the models it mocked.
  if (typeof prisma.submission?.deleteMany !== "function") return;
  await prisma.$transaction([
    prisma.submission.deleteMany(),
    prisma.solvedProblem.deleteMany(),
    prisma.contestRegistration.deleteMany(),
    prisma.contestProblem.deleteMany(),
    // Phase 7 — live contest. Contest-scoped rows (announcements,
    // clarifications, balloons, contest-bound teams) cascade away with
    // `contest.deleteMany()` below via onDelete: Cascade. Persistent squads
    // (Team.contestId === null) don't, and Team.captainId is onDelete:
    // Restrict, so they must go explicitly before user.deleteMany().
    prisma.teamMember.deleteMany(),
    prisma.team.deleteMany(),
    prisma.contest.deleteMany(),
    prisma.adminAuditLog.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.featureFlag.deleteMany(),
    // Problem Domain (Phase 2) — children before parents so the FK chain
    // (TestCase -> TestGroup -> ProblemVersion -> Problem, ProblemTag ->
    // Problem/Tag) never blocks on a still-referenced row.
    prisma.testCase.deleteMany(),
    prisma.testGroup.deleteMany(),
    prisma.referenceSolution.deleteMany(),
    prisma.problemTag.deleteMany(),
    prisma.problemStats.deleteMany(),
    prisma.problemVersion.deleteMany(),
    prisma.problem.deleteMany(),
    prisma.tag.deleteMany(),
    // Judge queue (Phase 4) — RejudgeBatch.createdById is onDelete: Restrict,
    // so it must go before User; Submission is already gone above.
    prisma.rejudgeBatch.deleteMany(),
    prisma.judgeWorker.deleteMany(),
    // Classroom (Phase 6) — CourseSection.teacherId, GradeOverride.authorId,
    // AssignmentExtension.grantedById, GradebookSnapshot.createdById are all
    // onDelete: Restrict, so every classroom row goes before User.
    prisma.gradeOverride.deleteMany(),
    prisma.gradebookSnapshot.deleteMany(),
    prisma.gradebookColumn.deleteMany(),
    prisma.assignmentExtension.deleteMany(),
    prisma.assignmentProblem.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.courseSection.deleteMany(),
    prisma.course.deleteMany(),
    prisma.department.deleteMany(),
    prisma.semester.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

afterEach(async () => {
  if (hasTestDb) await resetDb();
});

afterAll(async () => {
  // A test file that mocks "@/lib/db" (e.g. src/lib/leaderboard.test.ts)
  // replaces this module in its own isolated registry, including the copy
  // this setup file sees — guard rather than assume the real client.
  if (!prismaModule || typeof prismaModule.prisma.$disconnect !== "function") return;
  await prismaModule.prisma.$disconnect();
});
