/**
 * Phase 13 Part 6 — quarterly restore-drill helper.
 *
 * "A backup that has never been restored is a hypothesis, not a backup"
 * (docs/phases/PHASE-13-scale-ops.md Part 6). This script automates the
 * mechanical part of a restore drill:
 *
 *   1. Produce a dump (pg_dump the current DATABASE_URL/DIRECT_URL, or accept
 *      an existing dump file via --dump-file, e.g. the latest
 *      scripts/backup-nightly.sh output pulled down from R2).
 *   2. Restore it into a scratch database — a fresh Neon branch (reusing the
 *      exact provisioning pattern tests/global-setup.ts already uses for
 *      NEON_API_KEY/NEON_PROJECT_ID), or a local Postgres if
 *      TEST_DATABASE_URL is set.
 *   3. Run `npm run test` against the restored database.
 *   4. Print elapsed time for each stage and the total.
 *
 * This environment has no live Neon/Postgres credentials, so running this
 * script here will (correctly) print "no restore target configured" and
 * exit 0 without doing anything destructive. That is expected — the script
 * is meant to be run by a human, quarterly, against real infrastructure; see
 * docs/DR-DRILL.md for where to record the result once it has actually run.
 *
 * Usage:
 *   npx tsx scripts/migrations/dr-restore-drill.ts [--dump-file path/to/dump.sql.gz]
 *
 * Restore target resolution (mirrors tests/global-setup.ts):
 *   1. TEST_DATABASE_URL, if set — restores into that Postgres instance.
 *   2. NEON_API_KEY + NEON_PROJECT_ID, if set — provisions a fresh ephemeral
 *      Neon branch and restores into it.
 *   3. Neither set — prints guidance and exits cleanly (exit 0, not an
 *      error — the absence of drill infrastructure is a known, documented
 *      state, not a script failure).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type Stage = { name: string; ms: number };

function parseArgs(): { dumpFile?: string } {
  const args = process.argv.slice(2);
  const i = args.indexOf("--dump-file");
  return { dumpFile: i >= 0 ? args[i + 1] : undefined };
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
    body: JSON.stringify({ branch: { name: `dr-drill-${Date.now()}` }, endpoints: [{ type: "read_write" }] }),
  });
  if (!res.ok) {
    console.error(`Neon branch provisioning failed: ${res.status} ${await res.text()}`);
    return null;
  }
  const data = (await res.json()) as { connection_uris?: { connection_uri: string }[] };
  return data.connection_uris?.[0]?.connection_uri ?? null;
}

async function resolveRestoreTarget(): Promise<string | null> {
  if (process.env.TEST_DATABASE_URL) {
    console.log("Restore target: TEST_DATABASE_URL (local/CI Postgres)");
    return process.env.TEST_DATABASE_URL;
  }
  if (process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID) {
    console.log("Restore target: provisioning a fresh Neon branch...");
    const url = await provisionNeonBranch();
    if (url) {
      console.log("Restore target: Neon branch ready.");
      return url;
    }
    console.warn("Neon branch provisioning failed.");
    return null;
  }
  return null;
}

function timed<T>(name: string, fn: () => T): { result: T; stage: Stage } {
  const start = performance.now();
  const result = fn();
  const ms = Math.round(performance.now() - start);
  return { result, stage: { name, ms } };
}

async function main() {
  const { dumpFile } = parseArgs();
  const stages: Stage[] = [];
  const totalStart = performance.now();

  const target = await resolveRestoreTarget();
  if (!target) {
    console.log("\nNo restore target configured — set TEST_DATABASE_URL for a local Postgres");
    console.log("target, or NEON_API_KEY + NEON_PROJECT_ID to provision an ephemeral Neon");
    console.log("branch (see .env.example). This environment has neither, which is expected —");
    console.log("no real drill can run here. See docs/DR-DRILL.md to record a drill once one");
    console.log("has actually been performed against real infrastructure.");
    return;
  }

  let dumpPath = dumpFile;
  if (dumpPath) {
    if (!existsSync(dumpPath)) {
      console.error(`Dump file not found: ${dumpPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Using existing dump file: ${dumpPath}`);
  } else {
    const sourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!sourceUrl) {
      console.error("No --dump-file given and DIRECT_URL/DATABASE_URL are unset — nothing to dump.");
      process.exitCode = 1;
      return;
    }
    const dir = mkdtempSync(path.join(tmpdir(), "dr-drill-"));
    dumpPath = path.join(dir, "dump.sql");
    console.log(`Dumping current database to ${dumpPath}...`);
    const { stage } = timed("pg_dump", () => {
      execSync(`pg_dump "${sourceUrl}" -f "${dumpPath}"`, { stdio: "inherit" });
    });
    stages.push(stage);
  }

  console.log(`Restoring dump into scratch database...`);
  const { stage: restoreStage } = timed("restore (psql)", () => {
    execSync(`psql "${target}" -f "${dumpPath}"`, { stdio: "inherit" });
  });
  stages.push(restoreStage);

  console.log(`Running test suite against the restored database...`);
  const { stage: testStage } = timed("npm run test", () => {
    execSync("npm run test", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: target, DIRECT_URL: target },
    });
  });
  stages.push(testStage);

  const totalMs = Math.round(performance.now() - totalStart);

  console.log("\n=== DR restore drill summary ===");
  for (const s of stages) console.log(`${s.name}: ${s.ms}ms`);
  console.log(`Total: ${totalMs}ms`);
  console.log("\nRecord this result in docs/DR-DRILL.md (date, operator, elapsed time,");
  console.log("what broke, what was fixed).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
