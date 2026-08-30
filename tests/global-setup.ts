import { execSync } from "node:child_process";

/**
 * Runs once before any test worker starts (vitest's `globalSetup`), not once
 * per test file — `prisma migrate deploy` is slow enough that running it per
 * file (as tests/setup.ts's beforeAll used to) blew past the per-file hook
 * timeout once more than a couple of files needed the DB.
 *
 * DB resolution mirrors tests/setup.ts's `hasTestDb`: TEST_DATABASE_URL if
 * set (CI's Postgres service container), otherwise a best-effort ephemeral
 * Neon branch when NEON_API_KEY + NEON_PROJECT_ID are present, otherwise the
 * integration tier is left to skip itself.
 */
export async function setup() {
  if (!process.env.TEST_DATABASE_URL && process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID) {
    try {
      const branchUrl = await provisionNeonBranch();
      if (branchUrl) process.env.TEST_DATABASE_URL = branchUrl;
    } catch (err) {
      console.warn("Neon branch provisioning failed, integration tests will skip:", err);
    }
  }

  if (!process.env.TEST_DATABASE_URL) return;

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env } });
}

async function provisionNeonBranch(): Promise<string | null> {
  const apiKey = process.env.NEON_API_KEY!;
  const projectId = process.env.NEON_PROJECT_ID!;
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ branch: { name: `test-${Date.now()}` }, endpoints: [{ type: "read_write" }] }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    connection_uris?: { connection_uri: string }[];
  };
  return data.connection_uris?.[0]?.connection_uri ?? null;
}
