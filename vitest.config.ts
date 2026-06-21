import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 10_000,
    // Run forked workers, one test file at a time. The stdio suites spawn
    // child MCP servers and the OAuth/HTTP suites bind ephemeral localhost
    // ports; serial file execution avoids port collisions and child-process
    // noise. Vitest 4 removed nested `poolOptions.forks.singleFork` — the
    // top-level equivalent is `pool: "forks"` + `fileParallelism: false`.
    pool: "forks",
    fileParallelism: false,
  },
});
