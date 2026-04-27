import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 10_000,
    pool: "forks",
    // Sequential pool for stdio tests — avoids port collisions and child-process noise
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
