import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: { reporter: ["text", "lcov"], include: ["src/lib/**"] },
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "threads",
    // Integration test files share one physical database (tests/setup.ts's
    // delete-based resetDb, not a per-test transaction — see its comment).
    // Running test files in parallel against that shared DB lets one file's
    // afterEach delete rows another file is mid-test with. Unit tests stay
    // fast; the integration tier is small enough that serial execution costs
    // seconds, not minutes.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
