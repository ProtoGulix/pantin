import { defineConfig } from "vitest/config";

// Vitest only discovers its configuration through a default export.
export default defineConfig({
  // The viewer build injects its version (ADR 0058); tests get a fixed one.
  define: { __PANTIN_VERSION__: JSON.stringify("0.0.0-test") },
  test: {
    include: ["packages/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    // The dev VM shares a small host: one worker per vCPU starved it until the
    // host itself went down (2026-10-02). Some tests also spawn the Python
    // converter, so each worker can cost two processes.
    maxWorkers: 4,
  },
});
